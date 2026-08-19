#!/bin/sh
set -eu

runtime_dir=/tmp/typr
mode=${TYPR_COMPILER_ASSETS_MODE:-r2}
variant=$(cat /etc/typr/image-variant)
mkdir -p "$runtime_dir" /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp /tmp/uwsgi_temp /tmp/scgi_temp

resolver=$(awk '$1 == "nameserver" { print $2; exit }' /etc/resolv.conf)
case "$resolver" in
  ""|*[!0-9A-Fa-f:.]*)
    echo "Container DNS resolver is missing or invalid." >&2
    exit 1
    ;;
esac
case "$resolver" in
  *:*) resolver="[$resolver]" ;;
esac
printf 'resolver %s valid=30s;\nresolver_timeout 3s;\n' "$resolver" > "$runtime_dir/resolver.conf"

case "$variant:$mode" in
  lite:r2)
    cp /etc/typr/compiler-r2.conf "$runtime_dir/compiler.conf"
    ;;
  lite:local|full:local)
    if [ ! -d /compiler-assets ]; then
      echo "Compiler asset directory /compiler-assets is required for $variant/$mode." >&2
      exit 1
    fi
    if find /compiler-assets -type l -o ! -type d ! -type f | grep -q .; then
      echo "Compiler asset directory contains a symlink or special file." >&2
      exit 1
    fi
    if ! awk '
      function decode(value) {
        gsub(/\\040/, " ", value)
        gsub(/\\011/, "\t", value)
        gsub(/\\012/, "\n", value)
        gsub(/\\134/, "\\", value)
        return value
      }
      {
        mount_point = decode($5)
        if (mount_point == "/compiler-assets" || index(mount_point, "/compiler-assets/") == 1) {
          options = "," $6 ","
          if (options !~ /,ro,/) bad = 1
        }
      }
      END { exit bad ? 1 : 0 }
    ' /proc/self/mountinfo; then
      echo "Compiler asset directory and all nested mounts must be read-only." >&2
      exit 1
    fi
    compiler_mount_options=$(awk '$5 == "/compiler-assets" { print $6; exit }' /proc/self/mountinfo)
    if [ -n "$compiler_mount_options" ]; then
      case ",$compiler_mount_options," in
        *,ro,*) ;;
        *)
          echo "Compiler asset directory must be mounted read-only." >&2
          exit 1
          ;;
      esac
    elif [ "$variant" = lite ]; then
      echo "Lite local mode requires an exact read-only /compiler-assets mount." >&2
      exit 1
    else
      root_mount_options=$(awk '$5 == "/" { print $6; exit }' /proc/self/mountinfo)
      case ",$root_mount_options," in
        *,ro,*) ;;
        *)
          echo "The full image requires a read-only container root filesystem." >&2
          exit 1
          ;;
      esac
    fi
    if ! cmp -s /etc/typr/compiler-assets-manifest.json /compiler-assets/manifest.json; then
      echo "Compiler asset manifest does not match this Typr image." >&2
      exit 1
    fi
    find /compiler-assets -type f | sed 's#^/compiler-assets/##' | LC_ALL=C sort > "$runtime_dir/actual.paths"
    if ! cmp -s /etc/typr/compiler-assets.paths "$runtime_dir/actual.paths"; then
      echo "Compiler asset directory contains missing or unexpected files." >&2
      exit 1
    fi
    while read -r expected_size relative_path; do
      if [ "$(stat -c %s "/compiler-assets/$relative_path")" != "$expected_size" ]; then
        echo "Compiler asset size validation failed for $relative_path." >&2
        exit 1
      fi
    done < /etc/typr/compiler-assets.sizes
    if ! (cd /compiler-assets && sha256sum -c /etc/typr/compiler-assets.sha256 >/dev/null); then
      echo "Compiler asset checksum validation failed." >&2
      exit 1
    fi
    cp /etc/typr/compiler-local.conf "$runtime_dir/compiler.conf"
    ;;
  *)
    echo "Unsupported Typr image variant/compiler mode: $variant/$mode" >&2
    exit 1
    ;;
esac

exec nginx -c /etc/nginx/nginx.conf -g 'daemon off;'

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDirectory = resolve(repositoryRoot, "screenshots");
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://127.0.0.1:5175/";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium";

const calculusDocument = `#set page(margin: 1.35cm)
#set text(size: 9.5pt)
#set heading(numbering: "1.")

#align(center)[
  #text(18pt, weight: "bold")[Calculus of Variations]
  #v(3pt)
  #emph[Extremals, first variations, and spectral methods]
]

#v(8pt)
For a smooth curve $y: [a,b] arrow RR$, consider the action
$ cal(F)[y] = integral_a^b L(x, y(x), y'(x)) dif x. $
A stationary path satisfies $delta cal(F)[y; eta] = 0$ for every test
function $eta$ with $eta(a) = eta(b) = 0$.

= First variation

Let $y_epsilon = y + epsilon eta$. Differentiating at $epsilon = 0$ gives
$ delta cal(F) = integral_a^b (partial L)/(partial y) eta + (partial L)/(partial y') eta' dif x. $
Integration by parts yields
$ delta cal(F) = integral_a^b ((partial L)/(partial y) - frac(d, d x) (partial L)/(partial y')) eta dif x, $
and therefore the Euler--Lagrange equation
$ (partial L)/(partial y) - frac(d, d x) (partial L)/(partial y') = 0. $

= Harmonic oscillator

For $L = 1/2 m y'^2 - 1/2 k y^2$, the extremals solve
$ m y'' + k y = 0, quad y(x) = A cos(omega x) + B sin(omega x), quad omega = sqrt(k/m). $
The conserved energy is
$ E = y' (partial L)/(partial y') - L = 1/2 m y'^2 + 1/2 k y^2. $

= Spectral approximation

On $[0, pi]$, expand the solution in a sine basis,
$ y_N(x) = sum_(n=1)^N a_n sin(n x), quad a_n = frac(2, pi) integral_0^pi y(x) sin(n x) dif x. $
For the Dirichlet energy $cal(E)[y] = integral_0^pi (y')^2 dif x$,
orthogonality gives the diagonal quadratic form
$ cal(E)[y_N] = frac(pi, 2) sum_(n=1)^N n^2 a_n^2. $

== Useful identities

$ integral_0^infinity e^(-t^2) dif t = frac(sqrt(pi), 2), quad nabla dot (nabla f) = Delta f, $
$ lim_(h arrow 0) frac(f(x+h)-f(x), h) = f'(x), quad e^x = sum_(n=0)^infinity frac(x^n, n!). $
`;

await mkdir(screenshotDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { width: 1440, height: 960 }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Themes", exact: true }).click();
  await page.getByRole("button", { name: "Ayu Dark", exact: true }).click();
  await page
    .getByLabel("Typr settings")
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await page.getByText("typst.typ", { exact: true }).first().click();
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText(calculusDocument);
  await page.keyboard.press("Control+Home");

  const compileButton = page.getByRole("button", { name: "Compile", exact: true });
  const preview = page.getByRole("img", { name: "Typst preview document" });
  await compileButton.waitFor();
  const previousPreviewSource = await preview.getAttribute("src");
  await compileButton.click();
  await preview.waitFor({ timeout: 60_000 });
  const compilationError = page.getByText(/^Compile error:/).last();
  const compilationOutcome = await Promise.race([
    page.waitForFunction((previousSource) => {
      const nextPreview = document.querySelector("img.preview-document__object");
      return nextPreview instanceof HTMLImageElement
        && nextPreview.complete
        && nextPreview.naturalWidth > 0
        && nextPreview.src !== previousSource;
    }, previousPreviewSource, { timeout: 60_000 }).then(() => "preview"),
    compilationError.waitFor({ timeout: 60_000 }).then(() => "error")
  ]);
  if (compilationOutcome === "error") {
    throw new Error((await compilationError.textContent()) ?? "README sample failed to compile");
  }
  await page.screenshot({
    path: resolve(screenshotDirectory, "typr-workspace.png")
  });
} finally {
  await browser.close();
}

console.log(`README screenshots written to ${screenshotDirectory}`);

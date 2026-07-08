#set document(title: "Complex Bibliography Test for Typst", author: "Typr Test Fixture")
#set page(margin: 1in)
#set text(size: 11pt)

= Complex Bibliography Test for Typst

This document exercises the same BibTeX database as the LaTeX fixture. It mixes
books, journal articles, conference-style entries, manuals, software, web
references, theses, accents, notes, DOIs, URLs, editors, pages, and repeated
citations.

Classic systems papers should appear together in a citation cluster:
@turing1936computable, @church1936unsolvable, and @mccarthy1960recursive.
The TeX lineage is represented by @knuth1984texbook and @lamport1986document.

== Repeated and Mixed Citations

Repeated citations should not duplicate bibliography entries:
@knuth1984texbook and @lamport1986document. Online and software references
should preserve useful access fields when the style supports them:
@typst2026docs, @latexproject2026, and @svgedit2026.

The bibliography also includes a thesis @shannon1940symbolic and an accent-heavy
fictional entry @garcia2024accents to check character handling.

== Bibliography

#bibliography("complex-bibliography.bib", title: "References")

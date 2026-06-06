# Failure Theory Explorer

An interactive plane-stress exercise for comparing ductile and brittle static
failure theories. The site is dependency-free and deploys through GitHub Pages.

## GitHub Pages

Every push to `main` deploys the site using
`.github/workflows/deploy-pages.yml`.

The published URL will use this format:

```text
https://GITHUB-USERNAME.github.io/static-failure-theory-widget/
```

## Add To Canvas

### Embed In A Canvas Page

Open the Canvas page's HTML editor and add:

```html
<iframe
  src="GITHUB-PAGES-URL"
  title="Failure Theory Explorer"
  width="100%"
  height="1100"
  style="border: 0;"
  loading="lazy"
  allowfullscreen>
</iframe>
```

If your institution removes iframe markup from Canvas pages, add the GitHub
Pages URL as an External URL module item and enable **Load in a new tab**.

## Local Preview

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000`.

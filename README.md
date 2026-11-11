# GraphHopper area tags demo (prebuilt)

Static site in `site/`. Deploy this folder as a Vercel project:

```
cd deploy
npx vercel deploy --prod
```

Or import it in Vercel with **Root Directory** set to this folder. No build step runs.
`vercel.json` sends `X-Robots-Tag: noindex, nofollow` on every response, and `robots.txt` disallows all crawling.

The plugin source, scripts and raw results are in `site/area-tags-source.zip`. The full README, including what was and
was not measured, is at the root of the project zip.

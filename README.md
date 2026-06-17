# Oil Paint Studio

Turn any photo into wet oil paint you can smear with your mouse or finger.

## Run

```bash
npm install
npm run dev
```

## How it works

- **Upload** — drag & drop or click to open any image
- **Paint** — click and drag to smear colors locally under the brush; the rest of the image stays put
- **Controls** — adjust brush size, smear strength, and impasto depth

Built with a WebGL smear shader that pulls pixels along your stroke inside a soft brush — no full-image shifting.

## Save

Click **Save** to download your painting as a PNG.

`photo.jpg`, `photo.png`: a 320 by 240 crop of a phone photograph released to the public domain (CC0) on Wikimedia Commons ("Attila by Giovanni Bonazza, Musei Civici di Padova").
`anim.gif`: four 96 by 64 crops of `photo.png`, one frame each, made with Pillow (CC0, like its source).

`display-p3.icc`: a Display P3 profile made with Little CMS, from rapier-jxl's own tests.

Color, depth and WebP kinds, made by `make.py` from `photo.png` (run line at its top) with `display-p3.icc`: `p3-16bit.png` and `srgb-16bit.png` (true 16-bit samples, with
and without the profile), `p3-lossless.webp` (lossless, with the profile: a VP8X file), `exif-lossless.webp`,
`p3-lossy.webp`, `pal4.png`/`pal8.png` and `gray2.png`/`gray8.png` (the same picture at a low depth and at 8 bits),
`alpha.png` and `alpha.webp` (a gradient alpha, lossless). The interlaced twins are made with ImageMagick:
`convert p3-16bit.png -interlace PNG p3-16bit-interlaced.png`, and the same for `alpha.png`.
`anim-lossless.webp` (two lossless ANMF frames) and `anim.png` (an APNG): two frames of `photo.png`, by `make.py`.

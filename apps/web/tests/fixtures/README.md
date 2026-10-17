# Portrait EXIF fixture

`portrait-exif6.jpg` stores 400 × 300 pixels with EXIF Orientation 6. It is under 50 KB.

It was generated with a small Node script. The script created a 400 × 300 RGB byte buffer,
encoded it with the repo's existing `sharp` install, then inserted an EXIF APP1 segment
after JPEG's SOI bytes. The segment contains a little endian TIFF header and one
Orientation tag (`0x0112`) with value `6`. `sharp(...).metadata()` reports orientation 6.

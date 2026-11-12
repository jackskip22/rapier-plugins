// Share of its size a picture keeps after conversion at the defaults. Measured on ten pictures
// (see the report); the dry run says "about".
export const KEEPS: Record<string, number> = {
  jpeg: 0.85,
  gif: 0.5,
  'png-screenshot': 0.27,
  'png-photo': 0.1,
};

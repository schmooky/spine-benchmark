export function rgbToRgba(rgbString: string, alpha = 0.8) {
  // Regular expression to match the RGB values
  const rgbRegex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/;

  // Extract RGB values from the input string
  const match = rgbString.match(rgbRegex);

  if (!match) {
    throw new Error("Invalid RGB string format. Expected 'rgb(r, g, b)'");
  }

  // Parse the RGB values
  const [, r, g, b] = match.map(Number);

  // Validate RGB values
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    throw new Error("RGB values must be between 0 and 255");
  }

  // Validate alpha value
  if (alpha < 0 || alpha > 1) {
    throw new Error("Alpha value must be between 0 and 1");
  }

  // Construct the RGBA string
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** CDN thumb sibling for uploads from POST /api/uploads (…/uuid-thumb.jpg). */
export function photoDisplayUrl(url: string, preferThumb = true): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (!preferThumb) return url;
  if (url.includes("-thumb.")) return url;
  return url.replace(/\.(jpe?g|png|webp)(\?.*)?$/i, "-thumb.jpg$2");
}

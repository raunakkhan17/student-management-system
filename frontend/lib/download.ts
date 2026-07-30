/** Saves a Blob returned by the API as a file in the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Release the object URL once the download has been handed to the browser.
  URL.revokeObjectURL(url);
}

/** Builds an authenticated URL for a stored file served by the API. */
export function fileUrl(apiUrl: string, fileId: string, download = false): string {
  return `${apiUrl}/files/${fileId}${download ? '?download=true' : ''}`;
}

/** Hands a blob to the browser as a file download. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The file name from a `Content-Disposition` header, if it has one. */
export function filenameFrom(header: string | null): string | undefined {
  return /filename="?([^";]+)"?/.exec(header ?? "")?.[1];
}

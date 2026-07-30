'use client';

import { FileText, Paperclip, Upload, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
  accept?: string;
  disabled?: boolean;
  label?: string;
  description?: string;
}

/** Accessible drag-and-drop file picker with client-side size and count limits. */
export function FileDropzone({
  files,
  onChange,
  maxFiles = 10,
  maxSizeMb = 10,
  accept,
  disabled = false,
  label = 'Attachments',
  description,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;

    const candidates = [...incoming];
    const oversize = candidates.find((file) => file.size > maxSizeMb * 1024 * 1024);

    if (oversize) {
      setError(`${oversize.name} is larger than ${maxSizeMb} MB`);
      return;
    }

    if (files.length + candidates.length > maxFiles) {
      setError(`You can attach at most ${maxFiles} file${maxFiles === 1 ? '' : 's'}`);
      return;
    }

    setError('');
    onChange([...files, ...candidates]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) addFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-lg border border-dashed p-6 text-center transition-colors',
          isDragging ? 'border-primary bg-primary-muted' : 'border-border',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            // Reset so re-picking the same file still fires onChange.
            event.target.value = '';
          }}
        />

        <Upload className="text-muted-foreground mx-auto size-6" aria-hidden />
        <p className="mt-2 text-sm">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>{' '}
          <span className="text-muted-foreground">or drag them here</span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {description ?? `Up to ${maxFiles} files, ${maxSizeMb} MB each`}
        </p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-md border p-2.5"
            >
              <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, position) => position !== index))}
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only list of already-uploaded attachments with authenticated links. */
export function AttachmentList({
  attachments,
  apiUrl,
}: {
  attachments: { id: string; file: { id: string; originalName: string; sizeBytes: number } }[];
  apiUrl: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-center gap-3 rounded-md border p-2.5">
          <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <a
              href={`${apiUrl}/files/${attachment.file.id}?download=true`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary truncate text-sm font-medium hover:underline"
            >
              {attachment.file.originalName}
            </a>
            <p className="text-muted-foreground text-xs">
              {formatFileSize(attachment.file.sizeBytes)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

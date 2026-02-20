import { useState, useCallback, useEffect, useMemo, useRef, type DragEvent, type ChangeEvent } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Check, X, ImageIcon, Upload, ZoomIn } from 'lucide-react';
import { Button } from '../ui/button';

// ── Canvas extraction + compression ───────────────────────────────────────────

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
    const img = new Image();
    img.src = imageSrc;
    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
    });

    const OUTPUT = 256;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
        img,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0, OUTPUT, OUTPUT,
    );

    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/jpeg',
            0.82,
        ),
    );
}

// ── Crop modal ─────────────────────────────────────────────────────────────────

function CropModal({
    objectUrl,
    onConfirm,
    onCancel,
}: {
    objectUrl: string;
    onConfirm: (blob: Blob) => void;
    onCancel: () => void;
}) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [busy, setBusy] = useState(false);

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedAreaPixels(pixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;
        setBusy(true);
        try {
            const blob = await getCroppedBlob(objectUrl, croppedAreaPixels);
            onConfirm(blob);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative mx-4 flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl">
                <p className="text-sm font-medium">Crop avatar</p>

                {/* Crop area — fixed height */}
                <div className="relative h-72 w-full overflow-hidden rounded-xl bg-muted">
                    <Cropper
                        image={objectUrl}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                    />
                </div>

                {/* Zoom slider */}
                <div className="flex items-center gap-2">
                    <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full accent-foreground"
                    />
                </div>

                <div className="flex gap-2">
                    <Button className="flex-1 gap-1" onClick={() => void handleConfirm()} disabled={busy}>
                        {busy
                            ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-background" />
                            : <Check className="h-4 w-4" />
                        }
                        Use this crop
                    </Button>
                    <Button variant="outline" className="gap-1" onClick={onCancel} disabled={busy}>
                        <X className="h-4 w-4" /> Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AvatarUploaderProps {
    currentAvatarUrl?: string | null;
    currentEmoji?: string;
    /** Called with the final cropped/compressed blob ready for upload */
    onUpload: (blob: Blob) => Promise<void>;
}

export function AvatarUploader({ currentAvatarUrl, currentEmoji, onUpload }: AvatarUploaderProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl ?? null);

    // Object URL for the pending file — created once, cleaned up on change
    const pendingObjectUrl = useMemo(
        () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
        [pendingFile],
    );
    useEffect(() => {
        return () => {
            if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
        };
    }, [pendingObjectUrl]);

    // Sync preview with external prop (e.g. after store update)
    useEffect(() => {
        if (currentAvatarUrl) setPreviewUrl(currentAvatarUrl);
    }, [currentAvatarUrl]);

    const acceptFile = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        setPendingFile(file);
    };

    const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) acceptFile(f);
        e.target.value = '';
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) acceptFile(f);
    };

    const onCropConfirm = async (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);   // instant local preview
        setPendingFile(null);
        setBusy(true);
        try {
            await onUpload(blob);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {/* Drop zone */}
            <div
                role="button"
                tabIndex={0}
                aria-label="Upload member avatar"
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                className={`relative flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 transition ${isDragOver
                        ? 'border-foreground/60 bg-muted/60'
                        : 'border-dashed border-border hover:border-foreground/40 hover:bg-muted/30'
                    }`}
            >
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt="avatar"
                        className="h-full w-full object-cover"
                    />
                ) : currentEmoji ? (
                    <span className="text-3xl">{currentEmoji}</span>
                ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}

                {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
                    </div>
                )}

                {/* Upload badge */}
                <div className="absolute bottom-0 right-0 translate-x-1 translate-y-1 rounded-full border border-border bg-card p-1">
                    <Upload className="h-3 w-3 text-muted-foreground" />
                </div>
            </div>

            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />

            {/* Crop modal */}
            {pendingObjectUrl && (
                <CropModal
                    objectUrl={pendingObjectUrl}
                    onConfirm={(blob) => void onCropConfirm(blob)}
                    onCancel={() => setPendingFile(null)}
                />
            )}
        </>
    );
}

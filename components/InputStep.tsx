'use client';

import { useEffect, useRef, useState } from 'react';
import { hasFace } from '@/lib/face';

export default function InputStep({ onPhoto }: { onPhoto: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(() => {
          setCameraOn(false);
          setError('Camera unavailable — please upload a photo instead.');
        });
    }
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [cameraOn]);

  function emitFromCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!hasFace(img)) {
      setError("Hmm, we couldn't find a face — try again with your face centered.");
      return;
    }
    setError(null);
    onPhoto(canvas.toDataURL('image/png'));
  }

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    emitFromCanvas(canvas);
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      emitFromCanvas(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      setError('Could not read image — try another file.');
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl">Your photo</h2>
      {cameraOn ? (
        <div className="space-y-3">
          <div className="relative mx-auto w-72">
            <video ref={videoRef} autoPlay playsInline className="rounded-xl" />
            <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-[var(--gold)]/70" />
          </div>
          <button className="btn-gold" onClick={capture}>Capture</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button className="btn-gold" onClick={() => setCameraOn(true)}>Use camera</button>
          <label className="cursor-pointer underline opacity-80">
            or upload a photo
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface ContactQRCodeProps {
  name: string;
  publicKey: string;
  type: number;
  size?: number;
}

export default function ContactQRCode({ name, publicKey, type, size = 200 }: ContactQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contactUrl, setContactUrl] = useState<string>("");

  useEffect(() => {
    if (!canvasRef.current) return;

    const generateQR = async () => {
      try {
        const url = `meshcore://contact/add?name=${encodeURIComponent(name)}&public_key=${encodeURIComponent(publicKey)}&type=${type}`;
        setContactUrl(url);
        
        await QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQR();
  }, [name, publicKey, type, size]);

  return (
    <div className="flex flex-col items-center">
      <a
        href={contactUrl}
        rel="noopener noreferrer"
        className="inline-block hover:opacity-80 transition-opacity"
        title="Click to open meshcore contact link"
      >
        <canvas
          ref={canvasRef}
          className="border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer"
        />
      </a>
    </div>
  );
}

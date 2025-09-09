"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface ContactQRCodeProps {
  name: string;
  publicKey: string;
  type: number;
  size?: number;
}

export default function ContactQRCode({ name, publicKey, type, size = 200 }: ContactQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const generateQR = async () => {
      try {
        const contactUrl = `meshcore://contact/add?name=${encodeURIComponent(name)}&public_key=${encodeURIComponent(publicKey)}&type=${type}`;
        
        await QRCode.toCanvas(canvasRef.current, contactUrl, {
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
      <canvas
        ref={canvasRef}
        className="border border-gray-200 dark:border-gray-700 rounded-lg"
      />
    </div>
  );
}

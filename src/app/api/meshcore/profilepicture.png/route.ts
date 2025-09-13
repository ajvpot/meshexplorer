import { NextResponse } from "next/server";
import { getColourForName, getNameIconLabel } from "@/lib/meshcore-map-nodeutils";
import sharp from "sharp";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const nodeName = searchParams.get("name");
    
    if (!nodeName) {
      return NextResponse.json({ 
        error: "Node name parameter is required",
        code: "MISSING_NODE_NAME"
      }, { status: 400 });
    }

    // Get the color and label for the node name
    const backgroundColor = getColourForName(nodeName);
    const label = getNameIconLabel(nodeName);
    
    // Generate PNG profile picture
    const pngBuffer = await generateProfilePicturePNG(backgroundColor, label);
    
    // Return as PNG with proper content type
    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error generating profile picture:", error);
    
    return NextResponse.json({ 
      error: "Failed to generate profile picture",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

async function generateProfilePicturePNG(backgroundColor: string, label: string): Promise<Buffer> {
  const size = 512; // Square size
  const fontSize = 192; // Font size for the label
  
  // Create SVG string with properly centered text
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${backgroundColor}"/>
  <text 
    x="50%" 
    y="50%" 
    text-anchor="middle" 
    dominant-baseline="central" 
    font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" 
    font-size="${fontSize}" 
    fill="white"
  >${escapeXml(label)}</text>
</svg>`;

  // Convert SVG to PNG using Sharp
  const pngBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
    
  return pngBuffer;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
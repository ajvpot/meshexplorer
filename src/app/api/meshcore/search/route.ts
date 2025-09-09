import { NextResponse } from "next/server";
import { searchMeshcoreNodes } from "@/lib/clickhouse/actions";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const region = searchParams.get("region");
    const lastSeen = searchParams.get("lastSeen");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    
    // Validate limit
    if (limit < 1 || limit > 200) {
      return NextResponse.json({ 
        error: "Limit must be between 1 and 200",
        code: "INVALID_LIMIT"
      }, { status: 400 });
    }
    
    // If no query provided, return empty results
    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        query: query || "",
        region: region || null
      });
    }
    
    // Validate query length
    if (query.length > 100) {
      return NextResponse.json({ 
        error: "Query too long (max 100 characters)",
        code: "QUERY_TOO_LONG"
      }, { status: 400 });
    }
    
    // Validate lastSeen parameter
    let lastSeenValue: string | null = null;
    if (lastSeen !== null) {
      const lastSeenNum = parseInt(lastSeen, 10);
      if (isNaN(lastSeenNum) || lastSeenNum < 0) {
        return NextResponse.json({ 
          error: "lastSeen must be a positive number (seconds)",
          code: "INVALID_LAST_SEEN"
        }, { status: 400 });
      }
      lastSeenValue = lastSeen;
    }
    
    const results = await searchMeshcoreNodes({ 
      query: query.trim(), 
      region: region || undefined, 
      lastSeen: lastSeenValue,
      limit 
    });
    
    return NextResponse.json({
      results,
      total: results.length,
      query: query.trim(),
      region: region || null,
      lastSeen: lastSeenValue,
      limit
    });
  } catch (error) {
    console.error("Error searching meshcore nodes:", error);
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to search nodes",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

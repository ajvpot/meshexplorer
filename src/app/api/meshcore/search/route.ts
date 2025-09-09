import { NextResponse } from "next/server";
import { searchMeshcoreNodes } from "@/lib/clickhouse/actions";

interface SearchQueryParams {
  query?: string;
  region?: string;
  lastSeen?: string | null;
  limit: number;
  exact: boolean;
  is_repeater?: boolean;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate that body contains an array of queries
    if (!Array.isArray(body.queries)) {
      return NextResponse.json({ 
        error: "Body must contain a 'queries' array",
        code: "INVALID_BODY"
      }, { status: 400 });
    }
    
    // Validate queries array length
    if (body.queries.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0
      });
    }
    
    if (body.queries.length > 50) {
      return NextResponse.json({ 
        error: "Maximum 50 queries allowed per batch",
        code: "TOO_MANY_QUERIES"
      }, { status: 400 });
    }
    
    // Validate and normalize each query
    const normalizedQueries: SearchQueryParams[] = body.queries.map((queryObj: any, index: number) => {
      // Validate limit for each query
      const limit = parseInt(queryObj.limit || "50", 10);
      if (limit < 1 || limit > 200) {
        throw new Error(`Query ${index}: Limit must be between 1 and 200`);
      }
      
      // Validate query length
      if (queryObj.query && queryObj.query.length > 100) {
        throw new Error(`Query ${index}: Query too long (max 100 characters)`);
      }
      
      // Validate lastSeen parameter
      let lastSeenValue: string | null = null;
      if (queryObj.lastSeen !== null && queryObj.lastSeen !== undefined) {
        const lastSeenNum = parseInt(queryObj.lastSeen, 10);
        if (isNaN(lastSeenNum) || lastSeenNum < 0) {
          throw new Error(`Query ${index}: lastSeen must be a positive number (seconds)`);
        }
        lastSeenValue = queryObj.lastSeen.toString();
      }
      
      return {
        query: queryObj.query?.trim() || undefined,
        region: queryObj.region || undefined,
        lastSeen: lastSeenValue,
        limit,
        exact: Boolean(queryObj.exact),
        is_repeater: queryObj.is_repeater !== undefined ? Boolean(queryObj.is_repeater) : undefined
      };
    });
    
    // Execute batch search
    const results = await searchMeshcoreNodes(normalizedQueries);
    
    // Format response - array of arrays, one per query
    const formattedResults = normalizedQueries.map((queryParams: SearchQueryParams, index: number) => {
      const queryResults = Array.isArray(results) 
        ? (Array.isArray(results[index]) ? results[index] : [])
        : [];
      
      return queryResults;
    });
    
    return NextResponse.json({
      results: formattedResults
    });
  } catch (error) {
    console.error("Error in batch search:", error);
    
    // Handle validation errors
    if (error instanceof Error && error.message.includes('Query ')) {
      return NextResponse.json({ 
        error: error.message,
        code: "VALIDATION_ERROR"
      }, { status: 400 });
    }
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to execute batch search",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

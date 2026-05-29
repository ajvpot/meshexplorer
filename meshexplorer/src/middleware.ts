import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
    // Only apply CORS headers to API routes
    if (request.nextUrl.pathname.startsWith('/api/')) {
        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new NextResponse(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
                    'Access-Control-Allow-Credentials': 'true',
                },
            });
        }

        // For non-OPTIONS requests, get the response and add CORS headers
        const response = NextResponse.next();
        
        // Allow all origins for development
        response.headers.set('Access-Control-Allow-Origin', '*');
        
        // Allow common HTTP methods
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        
        // Allow common headers
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        
        // Allow credentials if needed
        response.headers.set('Access-Control-Allow-Credentials', 'true');
        return response;
    }
    return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
}; 
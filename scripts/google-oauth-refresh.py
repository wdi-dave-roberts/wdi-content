#!/usr/bin/env python3
"""
Get a new OAuth refresh token with Google Ads + Sheets scopes.

Usage:
  1. Set environment variables (or they'll be prompted):
     - GOOGLE_ADS_CLIENT_ID
     - GOOGLE_ADS_CLIENT_SECRET

  2. Run: python scripts/google-oauth-refresh.py

  3. Browser opens, you authorize, and get back a refresh token

  4. Update your .env with the new GOOGLE_ADS_REFRESH_TOKEN
"""

import os
import sys
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import urlopen, Request
from urllib.error import HTTPError
import webbrowser

# Scopes - both Ads and Sheets
SCOPES = [
    "https://www.googleapis.com/auth/adwords",
    "https://www.googleapis.com/auth/spreadsheets",
]

AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REDIRECT_URI = "http://localhost:8080"

# Will be set by the callback handler
auth_code = None


class OAuthCallbackHandler(BaseHTTPRequestHandler):
    """Handle the OAuth callback."""

    def do_GET(self):
        global auth_code

        query = parse_qs(urlparse(self.path).query)

        if "code" in query:
            auth_code = query["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
                <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>Authorization successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                </body></html>
            """)
        else:
            error = query.get("error", ["Unknown error"])[0]
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(f"""
                <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
                <h1>Authorization failed</h1>
                <p>Error: {error}</p>
                </body></html>
            """.encode())

    def log_message(self, format, *args):
        pass  # Suppress server logs


def get_credentials():
    """Get client ID and secret from env or prompt."""
    client_id = os.environ.get("GOOGLE_ADS_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_ADS_CLIENT_SECRET")

    if not client_id:
        client_id = input("Enter GOOGLE_ADS_CLIENT_ID: ").strip()
    if not client_secret:
        client_secret = input("Enter GOOGLE_ADS_CLIENT_SECRET: ").strip()

    return client_id, client_secret


def main():
    global auth_code

    print("=" * 60)
    print("Google OAuth Refresh Token Generator")
    print("Scopes: Google Ads + Google Sheets")
    print("=" * 60)
    print()

    client_id, client_secret = get_credentials()

    if not client_id or not client_secret:
        print("Error: Missing client ID or secret")
        sys.exit(1)

    # Build authorization URL
    auth_params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",  # Force consent to get refresh token
    }
    auth_url = f"{AUTH_URI}?{urlencode(auth_params)}"

    print("Opening browser for authorization...")
    print(f"If browser doesn't open, go to:\n{auth_url}\n")

    # Start local server to receive callback
    server = HTTPServer(("localhost", 8080), OAuthCallbackHandler)

    # Open browser
    webbrowser.open(auth_url)

    # Wait for callback
    print("Waiting for authorization...")
    while auth_code is None:
        server.handle_request()

    server.server_close()

    print("\nExchanging code for tokens...")

    # Exchange code for tokens
    token_data = urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "code": auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    }).encode()

    try:
        req = Request(TOKEN_URI, data=token_data, method="POST")
        with urlopen(req) as response:
            tokens = json.loads(response.read().decode())
    except HTTPError as e:
        print(f"Error: {e.read().decode()}")
        sys.exit(1)

    refresh_token = tokens.get("refresh_token")

    if not refresh_token:
        print("Error: No refresh token in response")
        print(f"Response: {tokens}")
        sys.exit(1)

    print()
    print("=" * 60)
    print("SUCCESS! Here's your new refresh token:")
    print("=" * 60)
    print()
    print(refresh_token)
    print()
    print("=" * 60)
    print("Update your .env file:")
    print(f"GOOGLE_ADS_REFRESH_TOKEN={refresh_token}")
    print("=" * 60)


if __name__ == "__main__":
    main()

import os
import sys

# Add project root to sys.path for Vercel Serverless Function entrypoint
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

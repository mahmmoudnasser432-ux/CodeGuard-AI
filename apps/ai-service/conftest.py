import os
import sys

# Ensure apps/ai-service is in sys.path so 'import app...' works from anywhere
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

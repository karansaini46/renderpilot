import sys

try:
    from config import config
except ValueError as e:
    # Environment validation failed
    sys.exit(1)
except Exception as e:
    print(f"Unexpected error during startup initialization: {e}", file=sys.stderr)
    sys.exit(1)

def main():
    print("Worker client started successfully.")
    print(f"Worker ID: {config.WORKER_ID}")
    print(f"Worker Name: {config.WORKER_NAME}")
    print(f"Storage Provider: {config.STORAGE_PROVIDER}")
    print(f"Storage Bucket: {config.STORAGE_BUCKET}")
    # Secrets like DATABASE_URL are loaded securely into config and NEVER printed in logs.
    
if __name__ == '__main__':
    main()

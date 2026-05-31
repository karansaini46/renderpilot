import os
import sys
import boto3
from botocore.exceptions import ClientError
from config import config

_s3_client = None

def get_s3_client():
    global _s3_client
    if _s3_client is None:
        try:
            _s3_client = boto3.client(
                's3',
                region_name=config.AWS_REGION,
                aws_access_key_id=config.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=config.AWS_SECRET_ACCESS_KEY
            )
        except Exception as e:
            # Shield AWS credentials from error output logs
            print("Failed to initialize boto3 S3 client: Configuration error", file=sys.stderr)
            raise RuntimeError("S3 client initialization failed") from e
    return _s3_client

def uploadFileFromWorker(localPath: str, key: str) -> None:
    """
    Uploads a local file from the worker node directly to the private S3 bucket.
    """
    if not os.path.exists(localPath):
        raise FileNotFoundError(f"Local file does not exist for upload: {localPath}")
        
    s3 = get_s3_client()
    try:
        s3.upload_file(
            Filename=localPath,
            Bucket=config.AWS_S3_BUCKET,
            Key=key
        )
    except ClientError as e:
        error_msg = f"Failed to upload file to S3: {e.response['Error']['Message'] if 'Error' in e.response else str(e)}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg) from e
    except Exception as e:
        error_msg = f"Unexpected error during S3 file upload: {str(e)}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg) from e

def downloadFileToWorker(key: str, localPath: str) -> None:
    """
    Downloads an object from the private S3 bucket to a local workspace path.
    """
    local_dir = os.path.dirname(localPath)
    if local_dir and not os.path.exists(local_dir):
        os.makedirs(local_dir, exist_ok=True)
        
    s3 = get_s3_client()
    try:
        s3.download_file(
            Bucket=config.AWS_S3_BUCKET,
            Key=key,
            Filename=localPath
        )
    except ClientError as e:
        error_msg = f"Failed to download file from S3: {e.response['Error']['Message'] if 'Error' in e.response else str(e)}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg) from e
    except Exception as e:
        error_msg = f"Unexpected error during S3 file download: {str(e)}"
        print(error_msg, file=sys.stderr)
        raise RuntimeError(error_msg) from e

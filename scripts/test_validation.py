import subprocess
import os
import sys

def run_cmd(args, env=None, use_shell=False):
    # On Windows, shell=True is needed for running npx/npm/etc commands.
    is_windows = sys.platform.startswith('win')
    shell = use_shell or (is_windows and args[0] in ['npx', 'npm'])
    
    result = subprocess.run(args, capture_output=True, text=True, env=env, shell=shell)
    return result.returncode, result.stdout, result.stderr

def test_worker_validation():
    print("=== Testing Worker Config Validation ===")
    
    # Test case 1: Missing all variables
    env = os.environ.copy()
    vars_to_clear = [
        'DATABASE_URL', 'WORKER_ID', 'WORKER_NAME', 
        'COMFYUI_URL', 'BLENDER_PATH', 'LOCAL_WORKSPACE_ROOT', 
        'STORAGE_PROVIDER', 'STORAGE_BUCKET'
    ]
    for var in vars_to_clear:
        if var in env:
            del env[var]
            
    code, stdout, stderr = run_cmd([sys.executable, 'apps/worker/main.py'], env=env)
    
    print(f"Exit code: {code}")
    print(f"Stdout:\n{stdout}")
    print(f"Stderr:\n{stderr}")
    
    assert code != 0, "Worker should fail when environment variables are missing"
    assert "DATABASE_URL" in stderr or "DATABASE_URL" in stdout, "Error message should mention missing DATABASE_URL"
    assert "WORKER_ID" in stderr or "WORKER_ID" in stdout, "Error message should mention missing WORKER_ID"
    # Ensure DATABASE_URL value is NOT in the logs/stderr/stdout
    assert "postgres://" not in stderr and "postgres://" not in stdout, "Secrets must not be logged"
    print("  -> Passed: Worker fails clearly on missing env vars, and no secrets are logged.\n")

    # Test case 2: All variables present
    env['DATABASE_URL'] = 'postgres://user:supersecretpass@localhost:5432/renderpilot'
    env['WORKER_ID'] = 'test_worker_1'
    env['WORKER_NAME'] = 'Test Worker'
    env['COMFYUI_URL'] = 'http://localhost:8188'
    env['BLENDER_PATH'] = 'C:\\Program Files\\Blender'
    env['LOCAL_WORKSPACE_ROOT'] = 'C:\\workspace'
    env['STORAGE_PROVIDER'] = 's3'
    env['STORAGE_BUCKET'] = 'test-bucket'
    
    code, stdout, stderr = run_cmd([sys.executable, 'apps/worker/main.py'], env=env)
    
    print(f"Exit code: {code}")
    print(f"Stdout:\n{stdout}")
    print(f"Stderr:\n{stderr}")
    
    assert code == 0, f"Worker should succeed when all variables are present. Stderr: {stderr}"
    assert "Worker client started successfully." in stdout
    # Ensure DATABASE_URL value is NOT in the logs
    assert "supersecretpass" not in stdout and "supersecretpass" not in stderr, "Secrets must not be logged"
    print("  -> Passed: Worker succeeds when env vars are present, and no secrets are logged.\n")

def test_web_validation():
    print("=== Testing Web Config Validation ===")
    
    # Test case 1: Missing all variables
    env = os.environ.copy()
    vars_to_clear = [
        'DATABASE_URL', 'STORAGE_PROVIDER', 'STORAGE_BUCKET', 'STORAGE_PUBLIC_BASE_URL'
    ]
    for var in vars_to_clear:
        if var in env:
            del env[var]
            
    code, stdout, stderr = run_cmd(['npx', 'tsx', 'apps/web/test-validation.ts'], env=env)
    
    print(f"Exit code: {code}")
    print(f"Stdout:\n{stdout}")
    print(f"Stderr:\n{stderr}")
    
    assert code != 0, "Web app should fail when environment variables are missing"
    assert "DATABASE_URL" in stderr or "DATABASE_URL" in stdout, "Error message should mention missing DATABASE_URL"
    assert "STORAGE_PROVIDER" in stderr or "STORAGE_PROVIDER" in stdout, "Error message should mention missing STORAGE_PROVIDER"
    assert "postgres://" not in stderr and "postgres://" not in stdout, "Secrets must not be logged"
    print("  -> Passed: Web fails clearly on missing env vars, and no secrets are logged.\n")

    # Test case 2: All variables present
    env['DATABASE_URL'] = 'postgres://user:websecretpass@localhost:5432/renderpilot'
    env['STORAGE_PROVIDER'] = 'cloudflare_r2'
    env['STORAGE_BUCKET'] = 'renderpilot-assets'
    env['STORAGE_PUBLIC_BASE_URL'] = 'https://pub-id.r2.dev'
    
    code, stdout, stderr = run_cmd(['npx', 'tsx', 'apps/web/test-validation.ts'], env=env)
    
    print(f"Exit code: {code}")
    print(f"Stdout:\n{stdout}")
    print(f"Stderr:\n{stderr}")
    
    assert code == 0, f"Web app should succeed when all variables are present. Stderr: {stderr}"
    assert "SUCCESS" in stdout
    # Ensure DATABASE_URL value is NOT in the logs
    assert "websecretpass" not in stdout and "websecretpass" not in stderr, "Secrets must not be logged"
    print("  -> Passed: Web succeeds when env vars are present, and no secrets are logged.\n")

def main():
    try:
        test_worker_validation()
        test_web_validation()
        print("All configuration validation tests passed successfully!")
    except AssertionError as e:
        print(f"Test Assertion Failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()

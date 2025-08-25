"""
Hugging Face Spaces wrapper for the Doc-less API Agent
This file provides robust Python wrapper for Spaces deployment
"""

import subprocess
import sys
import os
import time
import json
import logging
import signal
import requests
from threading import Thread, Event
from datetime import datetime
from pathlib import Path

# Configure logging for Spaces
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('logs/spaces.log', mode='a') if os.path.exists('logs') else logging.NullHandler()
    ]
)
logger = logging.getLogger('spaces-wrapper')

class SpacesNodeServer:
    def __init__(self):
        self.process = None
        self.shutdown_event = Event()
        self.is_healthy = False
        self.start_time = None
        
        # Spaces environment detection
        self.is_spaces = os.getenv('HUGGING_FACE_SPACES', 'false').lower() == 'true'
        self.port = int(os.getenv('PORT', 7860))
        self.workspace_dir = Path('/tmp/user-sessions') if self.is_spaces else Path('demo-sessions')
        
        # Ensure directories exist
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        Path('logs').mkdir(exist_ok=True)
        
        logger.info(f"🤗 Starting Doc-less API Agent on {'Spaces' if self.is_spaces else 'Local'} environment")
        logger.info(f"🌐 Port: {self.port}, Workspace: {self.workspace_dir}")

    def setup_environment(self):
        """Set up environment variables for Spaces"""
        env_vars = {
            'NODE_ENV': 'production',
            'PORT': str(self.port),
            'CORS_ORIGIN': '*',
            'WORKSPACE_DIR': str(self.workspace_dir),
            'IS_SPACES': 'true' if self.is_spaces else 'false'
        }
        
        for key, value in env_vars.items():
            os.environ[key] = value
            logger.info(f"📝 Set {key}={value}")

    def start_node_server(self):
        """Start the Node.js server with proper error handling"""
        try:
            self.setup_environment()
            
            # Determine working directory
            work_dir = '/home/spaces/app' if os.path.exists('/home/spaces/app') else '.'
            logger.info(f"🏠 Working directory: {work_dir}")
            
            # Start the Node.js server
            cmd = ['npm', 'run', 'serve']
            logger.info(f"🚀 Starting Node.js server: {' '.join(cmd)}")
            
            self.process = subprocess.Popen(
                cmd,
                cwd=work_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            
            self.start_time = time.time()
            
            # Stream logs in real-time
            for line in iter(self.process.stdout.readline, ''):
                if self.shutdown_event.is_set():
                    break
                logger.info(f"NODE: {line.strip()}")
                
                # Check if server is ready
                if 'running on' in line.lower() or 'server running' in line.lower():
                    self.is_healthy = True
            
            # Wait for process completion
            self.process.wait()
            
        except Exception as e:
            logger.error(f"❌ Error starting Node.js server: {e}")
            sys.exit(1)

    def health_check(self, timeout=5):
        """Perform comprehensive health check"""
        try:
            response = requests.get(
                f'http://localhost:{self.port}/health', 
                timeout=timeout,
                headers={'User-Agent': 'Spaces-Health-Check'}
            )
            
            if response.status_code == 200:
                health_data = response.json()
                self.is_healthy = True
                logger.info(f"✅ Health check passed: {health_data.get('status', 'unknown')}")
                return True
            else:
                logger.warning(f"⚠️ Health check returned {response.status_code}")
                return False
                
        except requests.RequestException as e:
            logger.warning(f"⚠️ Health check failed: {e}")
            return False

    def wait_for_server(self, max_retries=30, delay=2):
        """Wait for server to be ready with exponential backoff"""
        logger.info("⏳ Waiting for server to start...")
        
        for i in range(max_retries):
            if self.shutdown_event.is_set():
                return False
                
            if self.health_check():
                uptime = time.time() - (self.start_time or time.time())
                logger.info(f"✅ Server ready in {uptime:.1f}s!")
                return True
            
            # Exponential backoff with jitter
            wait_time = min(delay * (1.2 ** i), 10) + (i * 0.1)
            logger.info(f"🔄 Health check {i+1}/{max_retries}, retrying in {wait_time:.1f}s...")
            time.sleep(wait_time)
        
        logger.error(f"❌ Server failed to start after {max_retries} attempts")
        return False

    def monitor_server(self):
        """Monitor server health and restart if necessary"""
        logger.info("👀 Starting health monitoring...")
        
        consecutive_failures = 0
        max_failures = 3
        
        while not self.shutdown_event.is_set():
            try:
                # Check if process is still running
                if self.process and self.process.poll() is not None:
                    logger.error(f"💀 Node.js process died with exit code {self.process.returncode}")
                    break
                
                # Perform health check
                if self.health_check(timeout=10):
                    consecutive_failures = 0
                    # Log periodic status
                    if int(time.time()) % 300 == 0:  # Every 5 minutes
                        uptime = time.time() - (self.start_time or time.time())
                        logger.info(f"💚 Server healthy, uptime: {uptime/60:.1f}m")
                else:
                    consecutive_failures += 1
                    logger.warning(f"⚠️ Health check failed ({consecutive_failures}/{max_failures})")
                    
                    if consecutive_failures >= max_failures:
                        logger.error("💀 Too many consecutive health check failures")
                        break
                
                time.sleep(60)  # Check every minute
                
            except Exception as e:
                logger.error(f"❌ Error in health monitoring: {e}")
                time.sleep(30)

    def cleanup(self):
        """Clean up resources"""
        logger.info("🧹 Cleaning up resources...")
        
        self.shutdown_event.set()
        
        if self.process:
            try:
                # Try graceful shutdown first
                self.process.terminate()
                
                # Wait for graceful shutdown
                try:
                    self.process.wait(timeout=10)
                    logger.info("✅ Node.js server shut down gracefully")
                except subprocess.TimeoutExpired:
                    # Force kill if necessary
                    self.process.kill()
                    logger.warning("⚠️ Forced Node.js server shutdown")
                    
            except Exception as e:
                logger.error(f"❌ Error during cleanup: {e}")

    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"🛑 Received signal {signum}, shutting down...")
        self.cleanup()
        sys.exit(0)

    def run(self):
        """Main execution method"""
        # Register signal handlers
        signal.signal(signal.SIGTERM, self.signal_handler)
        signal.signal(signal.SIGINT, self.signal_handler)
        
        try:
            # Start server in background thread
            server_thread = Thread(target=self.start_node_server, daemon=True)
            server_thread.start()
            
            # Wait for server to be ready
            if not self.wait_for_server():
                self.cleanup()
                sys.exit(1)
            
            # Create status file for Spaces
            status_file = self.workspace_dir / 'status.json'
            with open(status_file, 'w') as f:
                json.dump({
                    'status': 'running',
                    'port': self.port,
                    'started_at': datetime.utcnow().isoformat(),
                    'workspace': str(self.workspace_dir)
                }, f, indent=2)
            
            logger.info(f"📝 Status file created: {status_file}")
            
            # Start monitoring
            self.monitor_server()
            
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
            self.cleanup()
            sys.exit(1)
        finally:
            self.cleanup()

def main():
    """Main entry point"""
    server = SpacesNodeServer()
    
    try:
        server.run()
    except KeyboardInterrupt:
        logger.info("👋 Received keyboard interrupt, shutting down...")
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
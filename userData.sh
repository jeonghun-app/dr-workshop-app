#!/bin/bash

# Set up logging
LOG_DIR="/var/log/userdata"
LOG_FILE="${LOG_DIR}/userdata_$(date +%Y%m%d_%H%M%S).log"

# Create log directory if it doesn't exist
sudo mkdir -p "${LOG_DIR}"
sudo chmod 755 "${LOG_DIR}"

# Redirect all output to log file and console
exec 1> >(tee -a "${LOG_FILE}")
exec 2> >(tee -a "${LOG_FILE}" >&2)

# Enable error handling
set -e

# Function for logging with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

# Function for error handling
handle_error() {
    local line_no=$1
    local error_code=$?
    log "Error occurred in script at line: ${line_no}"
    log "Error code: ${error_code}"
    log "Check ${LOG_FILE} for complete log"
    exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Function to check command status
check_status() {
    if [ $? -ne 0 ]; then
        log "Error: $1 failed"
        exit 1
    fi
}

log "Starting UserData script execution..."
log "Log file location: ${LOG_FILE}"

# Generate random passwords if not set
DB_ROOT_PASSWORD="qwer1234"
DMS_USER_PASSWORD="qwer1234"
FINANCE_USER_PASSWORD="qwer1234"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000}"

log "Starting installation process..."

# Basic package installation
log "Installing basic packages..."
{
    sudo apt update -y
    sudo apt install -y mysql-server git apache2 curl unzip ufw
} || {
    log "Failed to install basic packages"
    exit 1
}


# Backup MySQL configuration and data
log "Backing up MySQL configuration..."
BACKUP_DIR="/var/backup/mysql"
sudo mkdir -p "${BACKUP_DIR}"
if [ -f /etc/mysql/mysql.conf.d/mysqld.cnf ]; then
    sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf "${BACKUP_DIR}/mysqld.cnf.backup_$(date +%Y%m%d)"
    log "MySQL configuration backed up"
fi

# MySQL configuration
log "Configuring MySQL..."
sudo sed -i.bak "s/bind-address.*/bind-address = 0.0.0.0/" /etc/mysql/mysql.conf.d/mysqld.cnf

# Enhanced MySQL security settings with better performance
sudo tee -a /etc/mysql/mysql.conf.d/mysqld.cnf << EOF
# Security settings
max_connections = 100
wait_timeout = 600
max_allowed_packet = 16M
skip-name-resolve
sql_mode = STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION

# Replication settings
server-id = 1
log-bin = mysql-bin
binlog_format = row
expire_logs_days = 7

# Performance settings
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
EOF

# Start and secure MySQL service
log "Starting MySQL service..."
{
    sudo systemctl start mysql
    sudo systemctl enable mysql
    sudo systemctl restart mysql
} || handle_error $LINENO

# Configure MySQL users and permissions with better security
log "Configuring MySQL users and permissions..."
{
    # Secure root user for all hosts
    sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';"
    sudo mysql -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';"
    sudo mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;"
    sudo mysql -e "FLUSH PRIVILEGES;"
    
    # Create and configure users
    sudo mysql -uroot -p"${DB_ROOT_PASSWORD}" << EOF
CREATE DATABASE IF NOT EXISTS finance_app;
CREATE USER IF NOT EXISTS 'finance_user'@'%' IDENTIFIED BY '${FINANCE_USER_PASSWORD}';
GRANT ALL PRIVILEGES ON finance_app.* TO 'finance_user'@'%';
CREATE USER IF NOT EXISTS 'dms_user'@'%' IDENTIFIED BY '${DMS_USER_PASSWORD}';
GRANT SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'dms_user'@'%';
FLUSH PRIVILEGES;
EOF

    # Import database schema
    log "Importing database schema..."
    if [ -f "/home/ubuntu/dr-workshop/DB/database_structure.sql" ]; then
        sudo mysql -uroot -p"${DB_ROOT_PASSWORD}" finance_app < /home/ubuntu/dr-workshop/DB/database_structure.sql || {
            log "Failed to import database schema"
            exit 1
        }
        log "Database schema imported successfully"
    else
        log "Warning: Database schema file not found at /home/ubuntu/dr-workshop/DB/database_structure.sql"
    fi

} || handle_error $LINENO

# Configure firewall
log "Configuring firewall..."
{
    sudo ufw --force enable
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 3306/tcp
    sudo ufw allow 5000/tcp
    sudo ufw allow 3000/tcp
    sudo ufw --force reload
} || handle_error $LINENO

# Install Node.js
log "Installing Node.js..."
{
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install -y nodejs
    sudo npm install -g npm@latest
} || handle_error $LINENO

# Install and configure PM2
log "Installing PM2..."
{
    sudo npm install -g pm2
    pm2 startup
    sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
} || handle_error $LINENO

# Configure WAS
log "Configuring WAS..."
cd /home/ubuntu/dr-workshop/WAS || handle_error $LINENO
{
    npm install
    # Create environment file for WAS
    cat << EOF > .env
DB_HOST=localhost
DB_USER=finance_user
DB_PASSWORD=${FINANCE_USER_PASSWORD}
DB_NAME=finance_app
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
JWT_SECRET=secret
EOF
    chmod 600 .env

    # Configure CORS
    cat << EOF > cors.js
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
module.exports = corsOptions;
EOF
    chmod 644 cors.js
} || handle_error $LINENO

# Configure Web Application
log "Configuring Web Application..."
cd /home/ubuntu/dr-workshop/web-app || handle_error $LINENO
{
    npm install
    # Create environment file for web app
    PUBLIC_IP=$(curl -s https://checkip.amazonaws.com)
    cat << EOF > .env
NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}:5000
EOF
    chmod 600 .env
    npm run build
} || handle_error $LINENO

# Configure Apache as reverse proxy
log "Configuring Apache reverse proxy..."
{
    sudo a2enmod proxy
    sudo a2enmod proxy_http
    sudo a2enmod rewrite
    
    # Create Apache configuration
    sudo tee /etc/apache2/sites-available/000-default.conf << EOF
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/html

    ProxyPreserveHost On
    
    # API Proxy
    ProxyPass /api http://localhost:5000/api
    ProxyPassReverse /api http://localhost:5000/api
    
    # Frontend Proxy
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    ErrorLog \${APACHE_LOG_DIR}/error.log
    CustomLog \${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
EOF

    sudo systemctl restart apache2
} || handle_error $LINENO

# Start applications with PM2
log "Starting applications with PM2..."
{
    # Start WAS
    cd /home/ubuntu/dr-workshop/WAS
    pm2 start index.js --name "dr-workshop-api" \
        --max-memory-restart 300M \
        --restart-delay 3000 \
        --exp-backoff-restart-delay=100 \
        --max-restarts=10 \
        -- -p 5000

    # Start Web Application
    cd /home/ubuntu/dr-workshop/web-app
    pm2 start npm --name "dr-workshop-web" \
        --max-memory-restart 300M \
        -- start -- -p 3000

    pm2 save
} || handle_error $LINENO

# Save credentials securely
log "Saving credentials..."
CREDS_FILE="/home/ubuntu/.credentials"
{
    echo "Database Credentials (Generated on $(date))" > "${CREDS_FILE}"
    echo "Root Password: ${DB_ROOT_PASSWORD}" >> "${CREDS_FILE}"
    echo "DMS User Password: ${DMS_USER_PASSWORD}" >> "${CREDS_FILE}"
    echo "Finance User Password: ${FINANCE_USER_PASSWORD}" >> "${CREDS_FILE}"
    chmod 600 "${CREDS_FILE}"
    chown ubuntu:ubuntu "${CREDS_FILE}"
} || handle_error $LINENO

# Install AWS CLI v2
log "Installing AWS CLI version 2..."
{
    sudo apt update -y
    sudo apt install -y unzip
    curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
    unzip awscliv2.zip
    sudo ./aws/install
    rm -f awscliv2.zip
    rm -rf aws/
    
    # Verify AWS CLI installation
    aws --version || {
        log "AWS CLI installation failed"
        exit 1
    }
} || handle_error $LINENO

# Deploy CloudFormation stacks with better error handling
log "Deploying CloudFormation stacks..."
cd /home/ubuntu/dr-workshop || handle_error $LINENO

deploy_stack() {
    local template=$1
    local stack_name=$2
    local max_retries=3
    local retry_count=0
    
    if [ -f "$template" ]; then
        while [ $retry_count -lt $max_retries ]; do
            log "Deploying $stack_name (Attempt $((retry_count + 1))/${max_retries})..."
            if aws cloudformation deploy \
                --template-file "$template" \
                --stack-name "$stack_name" \
                --region ap-northeast-2 \
                --capabilities CAPABILITY_NAMED_IAM; then
                log "$stack_name deployment successful"
                return 0
            else
                retry_count=$((retry_count + 1))
                if [ $retry_count -lt $max_retries ]; then
                    log "Deployment failed, waiting before retry..."
                    sleep 30
                fi
            fi
        done
        log "Failed to deploy $stack_name after $max_retries attempts"
        return 1
    else
        log "Template $template not found, skipping deployment"
        return 0
    fi
}

deploy_stack "awsdrs-vpc.json" "awsdrs-vpc-stack" || handle_error $LINENO
deploy_stack "drs-site-vpc.json" "drs-site-vpc-stack" || handle_error $LINENO

log "Installation completed successfully!"
log "You can find the credentials in ${CREDS_FILE}"
log "Log file is available at ${LOG_FILE}"



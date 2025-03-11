#!/bin/bash
# Enable error handling
set -e

# Function for logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function for error handling
handle_error() {
    log "Error occurred in script at line: $1"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Generate random passwords if not set
DB_ROOT_PASSWORD="${DB_ROOT_PASSWORD:-$(openssl rand -base64 12)}"
DMS_USER_PASSWORD="${DMS_USER_PASSWORD:-$(openssl rand -base64 12)}"
FINANCE_USER_PASSWORD="${FINANCE_USER_PASSWORD:-$(openssl rand -base64 12)}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000}"

log "Starting installation process..."

# Basic package installation
log "Installing basic packages..."
sudo apt update -y
sudo apt install -y mysql-server git apache2 curl unzip

# Backup MySQL configuration
if [ -f /etc/mysql/mysql.conf.d/mysqld.cnf ]; then
    sudo cp /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/mysql.conf.d/mysqld.cnf.backup
    log "MySQL configuration backed up"
fi

# MySQL configuration
log "Configuring MySQL..."
sudo sed -i "s/bind-address.*/bind-address = 0.0.0.0/" /etc/mysql/mysql.conf.d/mysqld.cnf

# Enhanced MySQL security settings
sudo tee -a /etc/mysql/mysql.conf.d/mysqld.cnf << EOF
# Security settings
max_connections = 100
wait_timeout = 600
max_allowed_packet = 16M
skip-name-resolve
sql_mode = STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION
server-id = 1
log-bin = mysql-bin
binlog_format = row
expire_logs_days = 7
EOF

# Start MySQL service
log "Starting MySQL service..."
sudo systemctl start mysql || handle_error $LINENO
sudo systemctl enable mysql
sudo systemctl restart mysql

# Configure MySQL users and permissions
log "Configuring MySQL users and permissions..."
sudo mysql -e "SELECT 1 FROM mysql.user WHERE user='root' AND host='%' LIMIT 1;" | grep -q 1 || \
sudo mysql -e "CREATE USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';"

sudo mysql -uroot << EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS finance_app;
CREATE USER IF NOT EXISTS 'finance_user'@'localhost' IDENTIFIED BY '${FINANCE_USER_PASSWORD}';
GRANT ALL PRIVILEGES ON finance_app.* TO 'finance_user'@'localhost';
CREATE USER IF NOT EXISTS 'dms_user'@'%' IDENTIFIED BY '${DMS_USER_PASSWORD}';
GRANT SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'dms_user'@'%';
GRANT SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'root'@'%';
FLUSH PRIVILEGES;
EOF

# Import database structure if exists
if [ -f "/home/ubuntu/dr-workshop/DB/database_structure.sql" ]; then
    log "Importing database structure..."
    sudo mysql -uroot -p"${DB_ROOT_PASSWORD}" finance_app < /home/ubuntu/dr-workshop/DB/database_structure.sql
else
    log "Database structure file not found, skipping import"
fi

# Configure firewall
log "Configuring firewall..."
sudo ufw allow 3306/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Install Node.js
log "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
log "Installing PM2..."
sudo npm install -g pm2

# Configure WAS
log "Configuring WAS..."
cd /home/ubuntu/dr-workshop/WAS || handle_error $LINENO
npm install

# Create CORS configuration
log "Creating CORS configuration..."
cat << EOF > /home/ubuntu/dr-workshop/WAS/cors.js
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
};
module.exports = corsOptions;
EOF

# Start application with PM2
log "Starting application with PM2..."
pm2 start index.js --name "dr-workshop" -- -p 5000
pm2 save
pm2 startup

# Configure web application
log "Configuring web application..."
cd /home/ubuntu/dr-workshop/web-app || handle_error $LINENO
npm install

# Set environment variables
PUBLIC_IP=$(curl -s https://checkip.amazonaws.com)
echo "NEXT_PUBLIC_BACKEND_URL=http://${PUBLIC_IP}:5000" > .env
echo "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" >> .env

# Save credentials securely
log "Saving credentials..."
echo "Database Credentials" > /home/ubuntu/credentials.txt
echo "Root Password: ${DB_ROOT_PASSWORD}" >> /home/ubuntu/credentials.txt
echo "DMS User Password: ${DMS_USER_PASSWORD}" >> /home/ubuntu/credentials.txt
echo "Finance User Password: ${FINANCE_USER_PASSWORD}" >> /home/ubuntu/credentials.txt
chmod 600 /home/ubuntu/credentials.txt

# Install AWS CLI v2
log "Installing AWS CLI v2..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version

# Deploy CloudFormation stacks
log "Deploying CloudFormation stacks..."
cd /home/ubuntu/dr-workshop || handle_error $LINENO

deploy_stack() {
    local template=$1
    local stack_name=$2
    
    if [ -f "$template" ]; then
        log "Deploying $stack_name..."
        aws cloudformation deploy \
            --template-file "$template" \
            --stack-name "$stack_name" \
            --region ap-northeast-2 \
            --capabilities CAPABILITY_NAMED_IAM || {
                log "First attempt to deploy $stack_name failed, retrying..."
                aws cloudformation deploy \
                    --template-file "$template" \
                    --stack-name "$stack_name" \
                    --region ap-northeast-2 \
                    --capabilities CAPABILITY_NAMED_IAM
            }
    else
        log "Template $template not found, skipping deployment"
    fi
}

deploy_stack "awsdrs-vpc.json" "awsdrs-vpc-stack"
deploy_stack "drs-site-vpc.json" "drs-site-vpc-stack"

log "Installation completed successfully!"



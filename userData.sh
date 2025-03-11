#!/bin/bash
set -e

# 환경 변수로 비밀번호 설정
DB_ROOT_PASSWORD="qwer1234"
DMS_USER_PASSWORD="qwer1234"
FINANCE_USER_PASSWORD="qwer1234"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000}"

# 기본 패키지 설치
sudo apt update -y
sudo apt install -y mysql-server git apache2 curl

# 애플리케이션 클론
git clone https://github.com/jeonghun-app/dr-workshop-app.git /home/ubuntu/dr-workshop

# MySQL 설정
sudo sed -i "s/bind-address.*/bind-address = 0.0.0.0/" /etc/mysql/mysql.conf.d/mysqld.cnf

# MySQL 보안 설정 추가
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

# MySQL 서비스 시작
sudo systemctl start mysql
sudo systemctl enable mysql
sudo systemctl restart mysql

# MySQL 사용자 및 권한 설정
sudo mysql -e "SELECT 1 FROM mysql.user WHERE user='root' AND host='%' LIMIT 1;" | grep -q 1 || \
sudo mysql -e "CREATE USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';"

sudo mysql -uroot -p"${DB_ROOT_PASSWORD}" << EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS finance_app;
CREATE USER IF NOT EXISTS 'finance_user'@'localhost' IDENTIFIED BY '${FINANCE_USER_PASSWORD}';
GRANT ALL PRIVILEGES ON finance_app.* TO 'finance_user'@'localhost';
CREATE USER IF NOT EXISTS 'dms_user'@'%' IDENTIFIED BY '${DMS_USER_PASSWORD}';
GRANT SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'dms_user'@'%';
GRANT SELECT, RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'root'@'%';
FLUSH PRIVILEGES;
EOF

# 데이터베이스 구조 가져오기
if [ -f "/home/ubuntu/dr-workshop/DB/database_structure.sql" ]; then
    sudo mysql -uroot -p"${DB_ROOT_PASSWORD}" finance_app < /home/ubuntu/dr-workshop/DB/database_structure.sql
else
    echo "Skipping schema import, file not found"
fi

# 방화벽 설정
sudo ufw allow 3306/tcp

# Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 설치
sudo npm install -g pm2

# WAS 설정
cd /home/ubuntu/dr-workshop/WAS
npm install

# CORS 설정 파일 생성
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

# 애플리케이션 실행
pm2 start index.js --name "dr-workshop" -- -p 5000
pm2 save
pm2 startup

# 웹 애플리케이션 설정
cd /home/ubuntu/dr-workshop/web-app
npm install

# 환경 변수 설정
PUBLIC_IP=$(curl -s https://checkip.amazonaws.com/)
echo "NEXT_PUBLIC_BACKEND_URL=http://${PUBLIC_IP}:5000" > .env
echo "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" >> .env

# 비밀번호 정보 저장
echo "Database Credentials" > /home/ubuntu/credentials.txt
echo "Root Password: ${DB_ROOT_PASSWORD}" >> /home/ubuntu/credentials.txt
echo "DMS User Password: ${DMS_USER_PASSWORD}" >> /home/ubuntu/credentials.txt
echo "Finance User Password: ${FINANCE_USER_PASSWORD}" >> /home/ubuntu/credentials.txt
chmod 600 /home/ubuntu/credentials.txt

echo "Installation completed successfully!"

# 기본 패키지 설치
sudo apt update -y
sudo apt install -y mysql-server git apache2 curl

# Apache 서비스 설정
sudo systemctl restart apache2
sudo systemctl enable apache2
sudo systemctl restart apache2

# AWS CLI v2 설치
sudo apt update -y
sudo apt install -y unzip
sudo apt remove -y awscli
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version

# CloudFormation 스택 배포
cd /home/ubuntu/dr-workshop
if [ -f awsdrs-vpc.json ] && [ -f drs-site-vpc.json ]; then
    echo "Deploying awsdrs-vpc-stack with IAM capabilities"
    aws cloudformation deploy \
        --template-file awsdrs-vpc.json \
        --stack-name awsdrs-vpc-stack \
        --region ap-northeast-2 \
        --capabilities CAPABILITY_NAMED_IAM
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        echo "Failed to deploy awsdrs-vpc-stack. Retrying..."
        aws cloudformation deploy \
            --template-file awsdrs-vpc.json \
            --stack-name awsdrs-vpc-stack \
            --region ap-northeast-2 \
            --capabilities CAPABILITY_NAMED_IAM
    fi

    echo "Deploying drs-site-vpc-stack with IAM capabilities"
    aws cloudformation deploy \
        --template-file drs-site-vpc.json \
        --stack-name drs-site-vpc-stack \
        --region ap-northeast-2 \
        --capabilities CAPABILITY_NAMED_IAM
    RESULT=$?
    if [ $RESULT -ne 0 ]; then
        echo "Failed to deploy drs-site-vpc-stack. Retrying..."
        aws cloudformation deploy \
            --template-file drs-site-vpc.json \
            --stack-name drs-site-vpc-stack \
            --region ap-northeast-2 \
            --capabilities CAPABILITY_NAMED_IAM
    fi
else
    echo "VPC templates not found. Skipping deployment."
fi

# 애플리케이션 클론
git clone https://github.com/jeonghun-app/dr-workshop-app.git /home/ubuntu/dr-workshop

[이전 스크립트의 나머지 부분 계속...]

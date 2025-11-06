# 🏠 Room Service

Service quản lý phòng (rooms) cho hệ thống Dorm Booking System. Service này xử lý CRUD operations cho rooms, quản lý availability, và tích hợp với Kafka để publish events.

## 🚀 Tính năng

### **Room Management**
- ✅ Tạo room mới
- ✅ Lấy danh sách rooms
- ✅ Lấy room theo ID
- ✅ Cập nhật room
- ✅ Xóa room
- ✅ Lấy rooms theo building
- ✅ Kiểm tra availability
- ✅ Lọc và phân trang

### **Integration**
- ✅ Kafka event publishing (room.created, room.updated, room.deleted)
- ✅ External service calls
- ✅ Image upload support

### **Features**
- ✅ Room availability tracking
- ✅ Price management
- ✅ Room type management
- ✅ Capacity management

## 📁 Cấu trúc thư mục

```
src/
├── modules/
│   ├── rooms/           # Room module
│   │   ├── dto/        # Data Transfer Objects
│   │   ├── rooms.controller.ts
│   │   ├── rooms.service.ts
│   │   └── rooms.module.ts
│   └── kafka/          # Kafka integration
│       ├── kafka.module.ts
│       ├── kafka.producer.service.ts
│       └── kafka-topics.enum.ts
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── prisma.service.ts
└── main.ts
```

## ⚙️ Cấu hình

### **Environment Variables**

Tạo file `.env` trong thư mục root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/room_db"

# Application
PORT=3002
NODE_ENV=development

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=room-service
KAFKA_GROUP_ID=room-service-group

# External Services
BUILDING_SERVICE_URL=http://localhost:3003
BOOKING_SERVICE_URL=http://localhost:3005
```

## 🚀 Cài đặt và chạy

### **Yêu cầu**
- Node.js 18+
- PostgreSQL
- Kafka

### **Cài đặt**

```bash
# Cài đặt dependencies
npm install

# Tạo file .env
cp .env.example .env

# Chỉnh sửa .env với thông tin của bạn

# Chạy database migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

### **Chạy development**

```bash
npm run start:dev
# hoặc
npm run dev
```

### **Build và chạy production**

```bash
# Build
npm run build

# Chạy production
npm run start:prod
```

## 📡 API Endpoints

### **Room Management**

#### `POST /rooms`
Tạo room mới

**Request Body:**
```json
{
  "buildingId": "building-uuid",
  "name": "Room 101",
  "type": "SINGLE",
  "price": 500000,
  "capacity": 1,
  "description": "Nice room",
  "amenities": ["WiFi", "AC", "TV"]
}
```

**Response:**
```json
{
  "id": "room-uuid",
  "buildingId": "building-uuid",
  "name": "Room 101",
  "type": "SINGLE",
  "price": 500000,
  "capacity": 1,
  "description": "Nice room",
  "amenities": ["WiFi", "AC", "TV"],
  "isAvailable": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

#### `GET /rooms`
Lấy danh sách rooms (với phân trang và lọc)

**Query Parameters:**
- `page`: Số trang (default: 1)
- `limit`: Số items mỗi trang (default: 10)
- `buildingId`: Lọc theo building ID
- `type`: Lọc theo room type
- `minPrice`: Giá tối thiểu
- `maxPrice`: Giá tối đa
- `isAvailable`: Lọc theo availability
- `search`: Tìm kiếm theo name

**Example:**
```
GET /rooms?page=1&limit=10&buildingId=building-uuid&type=SINGLE&isAvailable=true
```

#### `GET /rooms/:id`
Lấy room theo ID

#### `PATCH /rooms/:id`
Cập nhật room

**Request Body:**
```json
{
  "name": "Updated Room Name",
  "price": 600000,
  "isAvailable": false
}
```

#### `DELETE /rooms/:id`
Xóa room

#### `GET /rooms/building/:buildingId`
Lấy rooms theo building ID

#### `GET /rooms/:id/availability`
Kiểm tra availability của room trong khoảng thời gian

**Query Parameters:**
- `startDate`: Ngày bắt đầu (ISO format)
- `endDate`: Ngày kết thúc (ISO format)

**Example:**
```
GET /rooms/room-uuid/availability?startDate=2025-01-01&endDate=2025-01-05
```

## 🔄 Kafka Events

Service publish các events sau lên Kafka:

### **room.created**
Khi room mới được tạo

```json
{
  "roomId": "room-uuid",
  "buildingId": "building-uuid",
  "name": "Room 101",
  "type": "SINGLE",
  "price": 500000,
  "capacity": 1,
  "isAvailable": true,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### **room.updated**
Khi room được cập nhật

### **room.deleted**
Khi room bị xóa

## 📝 Database Schema

Service sử dụng Prisma ORM. Xem file `prisma/schema.prisma` để biết chi tiết schema.

### **Main Models:**
- `Room` - Thông tin room

### **Room Types:**
- `SINGLE` - Phòng đơn
- `DOUBLE` - Phòng đôi
- `TRIPLE` - Phòng ba
- `QUAD` - Phòng bốn

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📚 Tài liệu thêm

- [KAFKA_EVENT_HANDLING.md](./KAFKA_EVENT_HANDLING.md) - Chi tiết về Kafka events

## 🐳 Docker

```bash
# Build image
docker build -t room-service .

# Run với docker-compose
docker-compose up
```

## 🔒 Security

- Input validation với class-validator
- SQL injection protection (Prisma)
- Helmet security headers

## 📝 Notes

- Service tích hợp với Booking Service để kiểm tra availability
- Kafka events được publish tự động khi có thay đổi
- Room availability được cập nhật dựa trên bookings

## 📄 License

MIT

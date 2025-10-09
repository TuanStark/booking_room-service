# 🔄 Kafka Event Handling - Room Service

## 📋 Tổng quan

Room Service xử lý các event từ Kafka để tự động cập nhật trạng thái phòng dựa trên các sự kiện booking và payment.

## 🎯 Các Event được xử lý

### **1. Booking Events**

#### **`booking.created`**
```json
{
  "roomId": "room-uuid",
  "bookingId": "booking-uuid", 
  "userId": "user-uuid",
  "startDate": "2025-10-07T00:00:00Z",
  "endDate": "2025-10-10T00:00:00Z"
}
```

**Xử lý:**
- ✅ Kiểm tra room có tồn tại không
- ✅ Kiểm tra room có status `AVAILABLE` không
- ✅ Đổi status từ `AVAILABLE` → `BOOKED`
- ✅ Log thành công

#### **`booking.canceled`**
```json
{
  "roomId": "room-uuid",
  "bookingId": "booking-uuid",
  "userId": "user-uuid", 
  "reason": "User canceled"
}
```

**Xử lý:**
- ✅ Kiểm tra room có tồn tại không
- ✅ Kiểm tra room có status `BOOKED` không
- ✅ Đổi status từ `BOOKED` → `AVAILABLE`
- ✅ Log thành công

### **2. Payment Events**

#### **`payment.success`**
```json
{
  "paymentId": "payment-uuid",
  "bookingId": "booking-uuid",
  "roomId": "room-uuid",
  "amount": 500000,
  "transactionId": "TXN123456"
}
```

**Xử lý:**
- ✅ Kiểm tra room có tồn tại không
- ✅ Kiểm tra room có status `BOOKED` không
- ✅ Giữ nguyên status `BOOKED` (payment chỉ confirm booking)
- ✅ Log thành công

#### **`payment.failed`**
```json
{
  "paymentId": "payment-uuid",
  "bookingId": "booking-uuid", 
  "roomId": "room-uuid",
  "amount": 500000,
  "reason": "Insufficient funds"
}
```

**Xử lý:**
- ✅ Kiểm tra room có tồn tại không
- ✅ Kiểm tra room có status `BOOKED` không
- ✅ Đổi status từ `BOOKED` → `AVAILABLE` (release room)
- ✅ Log thành công

#### **`payment.refunded`**
```json
{
  "paymentId": "payment-uuid",
  "bookingId": "booking-uuid",
  "roomId": "room-uuid", 
  "amount": 500000,
  "refundAmount": 500000,
  "reason": "User requested refund"
}
```

**Xử lý:**
- ✅ Kiểm tra room có tồn tại không
- ✅ Kiểm tra room có status `BOOKED` không
- ✅ Đổi status từ `BOOKED` → `AVAILABLE` (release room)
- ✅ Log thành công

## 🔄 Luồng hoạt động

### **Scenario 1: Booking thành công**
```
1. User tạo booking → booking.created event
2. Room status: AVAILABLE → BOOKED
3. User thanh toán → payment.success event  
4. Room status: BOOKED (giữ nguyên)
```

### **Scenario 2: Booking bị hủy**
```
1. User tạo booking → booking.created event
2. Room status: AVAILABLE → BOOKED
3. User hủy booking → booking.canceled event
4. Room status: BOOKED → AVAILABLE
```

### **Scenario 3: Payment thất bại**
```
1. User tạo booking → booking.created event
2. Room status: AVAILABLE → BOOKED
3. Payment thất bại → payment.failed event
4. Room status: BOOKED → AVAILABLE
```

### **Scenario 4: Refund**
```
1. User tạo booking → booking.created event
2. Room status: AVAILABLE → BOOKED
3. User thanh toán → payment.success event
4. Room status: BOOKED (giữ nguyên)
5. User yêu cầu refund → payment.refunded event
6. Room status: BOOKED → AVAILABLE
```

## 🛡️ Error Handling

### **Validation Checks:**
- ✅ Kiểm tra `roomId` có trong event không
- ✅ Kiểm tra room có tồn tại trong database không
- ✅ Kiểm tra room có đúng status để thực hiện action không

### **Error Cases:**
- ❌ `roomId` missing → Log warning, skip
- ❌ Room not found → Log error, skip
- ❌ Wrong room status → Log warning, skip
- ❌ Database error → Log error, throw exception

## 📊 Room Status Flow

```
AVAILABLE → BOOKED (booking.created)
    ↑           ↓
    ←───────────┘ (booking.canceled, payment.failed, payment.refunded)

BOOKED → BOOKED (payment.success - no change)
```

## 🧪 Testing

### **Test với Postman:**
```bash
# 1. Tạo room
POST /rooms
{
  "name": "Test Room",
  "buildingId": "building-uuid",
  "price": 500000,
  "capacity": 2
}

# 2. Kiểm tra room status
GET /rooms/{room-id}

# 3. Simulate booking event (qua Kafka)
# Room status sẽ thay đổi từ AVAILABLE → BOOKED

# 4. Simulate payment success event
# Room status sẽ giữ nguyên BOOKED

# 5. Simulate payment failed event  
# Room status sẽ thay đổi từ BOOKED → AVAILABLE
```

## 📝 Logs mẫu

```
📩 [Kafka] Booking created event received: { roomId: "room-123", bookingId: "booking-456" }
✅ Room room-123 status updated to BOOKED for booking booking-456

📩 [Kafka] Payment success event received: { paymentId: "payment-789", roomId: "room-123" }
✅ Payment payment-789 confirmed for booking booking-456, room room-123 remains BOOKED

📩 [Kafka] Payment failed event received: { paymentId: "payment-999", roomId: "room-123" }
✅ Room room-123 status updated to AVAILABLE after payment payment-999 failed
```

## ⚙️ Configuration

### **Kafka Topics:**
- `booking.created`
- `booking.canceled` 
- `payment.success`
- `payment.failed`
- `payment.refunded`

### **Environment Variables:**
```env
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=room-service
KAFKA_GROUP_ID=room-group
```

## 🚀 Benefits

1. **Tự động hóa:** Room status được cập nhật tự động
2. **Consistency:** Đảm bảo room status luôn đúng với booking/payment
3. **Real-time:** Cập nhật ngay khi có event
4. **Reliable:** Có error handling và validation
5. **Scalable:** Có thể handle nhiều event đồng thời

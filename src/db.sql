-- DATABASE
CREATE DATABASE football_booking;

-- DATABASE ichiga kirish
-- PostgreSQL:
-- \c football_booking


-- USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    age INT,
    city VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- OWNERS
CREATE TABLE owners (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    city VARCHAR(50)
);


-- STADIUMS
CREATE TABLE stadiums (
    id SERIAL PRIMARY KEY,
    owner_id INT REFERENCES owners(id),
    name VARCHAR(100),
    city VARCHAR(50),
    price_per_hour INT,
    capacity INT
);


-- BOOKINGS
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    stadium_id INT REFERENCES stadiums(id),
    booking_date DATE,
    start_time TIME,
    end_time TIME,
    total_price INT,
    status VARCHAR(20)
);


-- PAYMENTS
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    booking_id INT REFERENCES bookings(id),
    amount INT,
    payment_type VARCHAR(20),
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- USERS DATA

INSERT INTO users(full_name, phone, age, city)
VALUES
('Ali Valiyev','998901111111',25,'Toshkent'),
('Vali Hasanov','998902222222',30,'Samarqand'),
('Hasan Karimov','998903333333',22,'Toshkent'),
('Akmal Sobirov','998904444444',28,'Buxoro'),
('Jasur Aliyev','998905555555',35,'Toshkent'),
('Sardor Ergashev','998906666666',19,'Namangan');



-- OWNERS DATA

INSERT INTO owners(full_name, phone, city)
VALUES
('Bekzod Xasanov','998907777777','Toshkent'),
('Dilshod Karimov','998908888888','Samarqand'),
('Rustam Aliyev','998909999999','Buxoro');



-- STADIUMS DATA

INSERT INTO stadiums(owner_id,name,city,price_per_hour,capacity)
VALUES
(1,'Bunyodkor Arena','Toshkent',200000,22),
(1,'Mini Football Center','Toshkent',100000,10),
(2,'Samarkand Stadium','Samarqand',150000,18),
(2,'Registan Sport','Samarqand',120000,12),
(3,'Buxoro Arena','Buxoro',180000,20);



-- BOOKINGS DATA

INSERT INTO bookings(
user_id,
stadium_id,
booking_date,
start_time,
end_time,
total_price,
status
)
VALUES

(1,1,'2026-07-01','18:00','20:00',400000,'CONFIRMED'),

(2,2,'2026-07-01','20:00','21:00',100000,'CONFIRMED'),

(3,1,'2026-07-02','19:00','21:00',400000,'CONFIRMED'),

(1,3,'2026-07-03','17:00','20:00',450000,'CONFIRMED'),

(4,5,'2026-07-04','15:00','17:00',360000,'CANCELLED'),

(5,1,'2026-07-05','21:00','23:00',400000,'CONFIRMED'),

(6,4,'2026-07-05','18:00','20:00',240000,'CONFIRMED'),

(2,3,'2026-07-06','16:00','18:00',300000,'CONFIRMED');



-- PAYMENTS DATA

INSERT INTO payments(booking_id,amount,payment_type)
VALUES

(1,400000,'CARD'),
(2,100000,'CASH'),
(3,400000,'CARD'),
(4,450000,'ONLINE'),
(5,360000,'CASH'),
(6,400000,'CARD'),
(7,240000,'ONLINE'),
(8,300000,'CARD');


select * from users WHERE age = (select Max(age) from users)

SELECT COUNT(*) from users where  city = 'Toshkent'

select * from users where full_name LIKE '%a%'

SELECT * from users where age BETWEEN 26 AND 30

select * from stadiums where city = 'Toshkent'

select * from stadiums where price_per_hour > 150000

select * from stadiums where capacity > 15

select * from stadiums where age  > 25

select * from users where full_name LIKE 'Ali%'

select * from users where city in ('Toshkent', 'Samarqand')

select * from stadiums where price_per_hour BETWEEN 100000 and 200000

select name, price_per_hour from stadiums order by price_per_hour DESC limit 3

select * from users order by age ASC limit 2
-- CreateIndex
CREATE INDEX "Booking_status_startAt_status_pay_later_idx" ON "Booking"("status", "startAt", "status_pay_later");

-- CreateIndex
CREATE INDEX "Booking_status_endAt_check_in_idx" ON "Booking"("status", "endAt", "check_in");

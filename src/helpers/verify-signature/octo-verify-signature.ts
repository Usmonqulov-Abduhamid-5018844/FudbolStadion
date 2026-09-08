import { CreatOcto_PaymentDto } from "src/payment/dto/create-payment.dto";
import * as crypto from 'crypto';

export const verifyOctoSignature = (data: CreatOcto_PaymentDto): boolean => {
  const uniqueKey = process.env.OCTO_UNIQUE_KEY

  if (!uniqueKey) {
    return false;
  }
  const raw = `${uniqueKey}${data.octo_payment_UUID}${data.status}`
  const computedSignature = crypto
    .createHash('sha1')
    .update(raw)
    .digest('hex')
    .toUpperCase();

  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(data.signature.toUpperCase()),
  );
}
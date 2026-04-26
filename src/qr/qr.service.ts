import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class QrService {
  private secret = process.env.SECRET_KEY || "SUPPER_SECRET_KEY"

  async generateQr(bookingId: number) {
    const token = jwt.sign({ bookingId }, this.secret, { expiresIn: "5m" });

    const url = `checkin_ADMIN_${token}`;

    const qr = await QRCode.toDataURL(url);

    return {
      qr,
    };
  }
  verifyQr(token: string) {
    try {
      const data = jwt.verify(token, this.secret) as any;
      return data;
    } catch (e) {
      return null;
    }
  }
}

import { PrismaClient } from '@prisma/client';
import dns from 'dns';

const originalLookup = dns.lookup;
// @ts-ignore
dns.lookup = function (hostname, options, callback) {
  let opt = options;
  let cb = callback;
  if (typeof options === 'function') {
    cb = options;
    opt = {};
  }
  if (hostname === 'ep-fancy-river-apb2phrc-pooler.c-7.us-east-1.aws.neon.tech') {
    const family = (typeof opt === 'number' ? opt : (opt as any)?.family) || 4;
    const isAll = typeof opt === 'object' && opt !== null && (opt as any).all;
    if (family !== 6) {
      if (isAll) {
        return (cb as any)(null, [{ address: '52.4.160.253', family: 4 }]);
      }
      return (cb as any)(null, '52.4.160.253', 4);
    }
  }
  return originalLookup(hostname, opt as any, cb as any);
};

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
export default prisma;

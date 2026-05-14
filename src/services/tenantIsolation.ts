import { PrismaClient } from '@prisma/client';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  role?: string;
}

const tenantContext = new Map<string, TenantContext>();

export function setTenantContext(requestId: string, context: TenantContext) {
  tenantContext.set(requestId, context);
}

export function getTenantContext(requestId: string): TenantContext | undefined {
  return tenantContext.get(requestId);
}

export function clearTenantContext(requestId: string) {
  tenantContext.delete(requestId);
}

export function createTenantMiddleware(prisma: PrismaClient) {
  return prisma.$extends({
    name: 'tenantIsolation',
    model: {
      $allModels: {
        async $allOperations({ args, query, operation }) {
          const requestId = getCurrentRequestId();
          const context = requestId ? getTenantContext(requestId) : null;
          
          if (!context?.tenantId) {
            return query(args);
          }

          const tenantId = context.tenantId;

          if (operation === 'findUnique' || operation === 'findFirst' || operation === 'findUniqueOrThrow' || operation === 'findFirstOrThrow') {
            if (args.where && typeof args.where === 'object') {
              const where = args.where as Record<string, any>;
              if (!where.tenantId && !where.tenantId_not) {
                where.tenantId = tenantId;
              }
            }
          }

          if (operation === 'findMany' || operation === 'findFirstOrThrow' || operation === 'findManyOrThrow') {
            if (args.where && typeof args.where === 'object') {
              const where = args.where as Record<string, any>;
              if (!where.tenantId && !where.tenantId_not) {
                where.tenantId = tenantId;
              }
            }
          }

          if (operation === 'create') {
            args.data.tenantId = tenantId;
          }

          if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
            if (args.where && typeof args.where === 'object') {
              const where = args.where as Record<string, any>;
              if (!where.tenantId && !where.tenantId_not && !where.id) {
                where.tenantId = tenantId;
              }
            }
          }

          if (operation === 'deleteMany' || operation === 'updateMany' || operation === 'count') {
            if (args.where && typeof args.where === 'object') {
              const where = args.where as Record<string, any>;
              if (!where.tenantId && !where.tenantId_not) {
                where.tenantId = tenantId;
              }
            }
          }

          return query(args);
        }
      }
    }
  });
}

let currentRequestId = '';

function getCurrentRequestId(): string {
  return currentRequestId;
}

export function setCurrentRequestId(id: string) {
  currentRequestId = id;
}

export function createPrismaWithTenant(prisma: PrismaClient, tenantId: string): PrismaClient {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  setCurrentRequestId(requestId);
  setTenantContext(requestId, { tenantId });
  
  const extendedPrisma = createTenantMiddleware(prisma);
  
  return extendedPrisma;
}

export function createTenantScopedPrisma(prisma: PrismaClient) {
  return prisma.$extends({
    name: 'tenantScoped',
    model: {
      contact: {
        async findManyWithTenant(args: any = {}) {
          const requestId = getCurrentRequestId();
          const context = requestId ? getTenantContext(requestId) : null;
          
          if (!context?.tenantId) {
            return prisma.contact.findMany(args);
          }
          
          return prisma.contact.findMany({
            ...args,
            where: {
              ...args.where,
              tenantId: context.tenantId
            }
          });
        },
        
        async findUniqueWithTenant(where: any) {
          const requestId = getCurrentRequestId();
          const context = requestId ? getTenantContext(requestId) : null;
          
          if (!context?.tenantId) {
            return prisma.contact.findUnique({ where });
          }
          
          return prisma.contact.findFirst({
            where: {
              ...where,
              tenantId: context.tenantId
            }
          });
        },
        
        async createWithTenant(data: any) {
          const requestId = getCurrentRequestId();
          const context = requestId ? getTenantContext(requestId) : null;
          
          if (!context?.tenantId) {
            throw new Error('Tenant ID required');
          }
          
          return prisma.contact.create({
            data: {
              ...data,
              tenantId: context.tenantId
            }
          });
        }
      }
    }
  });
}

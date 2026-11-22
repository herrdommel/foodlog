import type { FastifyInstance } from 'fastify';
import { barcodeSchema, type ProductLookupDto } from '@foodlog/shared';
import { z } from 'zod';
import type { AppDeps } from '../app.ts';
import { AppError, parseBody } from '../lib/errors.ts';
import {
  buildProductLookup,
  createOpenFoodFacts,
  ProductLookupError,
} from '../services/products.ts';

export async function productRoutes(app: FastifyInstance, { config, db, fetch }: AppDeps) {
  const off = createOpenFoodFacts({ baseUrl: config.OPEN_FOOD_FACTS_URL, fetch });

  app.get(
    '/api/products/:barcode',
    {
      preHandler: [app.requireUser, app.requireFeature('barcode_scan')],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request): Promise<ProductLookupDto> => {
      const { barcode } = parseBody(z.object({ barcode: barcodeSchema }), request.params);
      try {
        const product = await off.lookup(barcode);
        if (!product) throw new ProductLookupError('not_found');
        return await buildProductLookup(db, request.user!.id, barcode, product);
      } catch (error) {
        if (error instanceof ProductLookupError) {
          if (error.kind === 'not_found') {
            throw new AppError(404, 'product_not_found', 'No product found for this barcode');
          }
          throw new AppError(502, 'product_lookup_failed', 'The product database is unreachable');
        }
        throw error;
      }
    },
  );
}

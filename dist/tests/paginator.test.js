"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const paginator_1 = require("../sdk/paginator");
describe('Paginator', () => {
    const mockApiResponse = (data, page, hasMore) => ({
        data,
        status: 200,
        statusText: 'OK',
        headers: {
            link: hasMore
                ? `<https://api.github.com/test?page=${page + 1}&per_page=2>; rel="next"`
                : '',
        },
        rate_limit: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1
        }
    });
    const mockHttpClient = jest.fn();
    beforeEach(() => {
        mockHttpClient.mockClear();
    });
    describe('createPaginator', () => {
        it('should create a paginator instance', () => {
            const config = { per_page: 10 };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            expect(paginator).toBeDefined();
        });
    });
    describe('pagination', () => {
        it('should iterate through all pages', async () => {
            // Mock responses for 3 pages
            mockHttpClient
                .mockResolvedValueOnce(mockApiResponse([{ id: 1 }, { id: 2 }], 1, true))
                .mockResolvedValueOnce(mockApiResponse([{ id: 3 }, { id: 4 }], 2, true))
                .mockResolvedValueOnce(mockApiResponse([{ id: 5 }], 3, false));
            const config = { per_page: 2 };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            const items = [];
            for await (const item of paginator) {
                items.push(item);
            }
            expect(items).toHaveLength(5);
            expect(items.map(item => item.id)).toEqual([1, 2, 3, 4, 5]);
            expect(mockHttpClient).toHaveBeenCalledTimes(3);
        });
        it('should handle empty responses', async () => {
            mockHttpClient.mockResolvedValueOnce(mockApiResponse([], 1, false));
            const config = { per_page: 10 };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            const items = [];
            for await (const item of paginator) {
                items.push(item);
            }
            expect(items).toHaveLength(0);
            expect(mockHttpClient).toHaveBeenCalledTimes(1);
        });
    });
    describe('deduplication', () => {
        it('should deduplicate items when enabled', async () => {
            // Mock response with duplicate items
            mockHttpClient
                .mockResolvedValueOnce(mockApiResponse([
                { id: 1, name: 'first' },
                { id: 2, name: 'second' }
            ], 1, true))
                .mockResolvedValueOnce(mockApiResponse([
                { id: 2, name: 'second' }, // Duplicate
                { id: 3, name: 'third' }
            ], 2, false));
            const config = {
                per_page: 2,
                deduplication: {
                    enabled: true,
                    keyField: 'id'
                }
            };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            const items = [];
            for await (const item of paginator) {
                items.push(item);
            }
            expect(items).toHaveLength(3); // Should be 3, not 4 due to deduplication
            expect(items.map(item => item.id)).toEqual([1, 2, 3]);
        });
        it('should not deduplicate when disabled', async () => {
            // Mock response with duplicate items
            mockHttpClient
                .mockResolvedValueOnce(mockApiResponse([
                { id: 1, name: 'first' },
                { id: 2, name: 'second' }
            ], 1, true))
                .mockResolvedValueOnce(mockApiResponse([
                { id: 2, name: 'second' }, // Duplicate
                { id: 3, name: 'third' }
            ], 2, false));
            const config = {
                per_page: 2,
                deduplication: {
                    enabled: false,
                    keyField: 'id'
                }
            };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            const items = [];
            for await (const item of paginator) {
                items.push(item);
            }
            expect(items).toHaveLength(4); // Should include duplicate
        });
    });
    describe('pagination info', () => {
        it('should provide pagination information', async () => {
            mockHttpClient.mockResolvedValueOnce(mockApiResponse([{ id: 1 }], 1, true));
            const config = { per_page: 1 };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            // Start iteration to trigger first request
            const iterator = paginator[Symbol.asyncIterator]();
            await iterator.next();
            const info = paginator.getInfo();
            expect(info.page).toBe(1);
            expect(info.per_page).toBe(1);
            expect(info.has_next).toBe(true);
            expect(info.has_prev).toBe(false);
        });
        it('should track total processed items', async () => {
            mockHttpClient.mockResolvedValueOnce(mockApiResponse([{ id: 1 }, { id: 2 }], 1, false));
            const config = { per_page: 2 };
            const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
            const items = [];
            for await (const item of paginator) {
                items.push(item);
            }
            expect(paginator.getTotalProcessed()).toBe(2);
        });
    });
    describe('utility functions', () => {
        describe('collectAll', () => {
            it('should collect all paginated items into array', async () => {
                mockHttpClient
                    .mockResolvedValueOnce(mockApiResponse([{ id: 1 }, { id: 2 }], 1, true))
                    .mockResolvedValueOnce(mockApiResponse([{ id: 3 }], 2, false));
                const config = { per_page: 2 };
                const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
                const allItems = await (0, paginator_1.collectAll)(paginator);
                expect(allItems).toHaveLength(3);
                expect(allItems.map(item => item.id)).toEqual([1, 2, 3]);
            });
        });
        describe('processBatches', () => {
            it('should process items in batches', async () => {
                mockHttpClient.mockResolvedValueOnce(mockApiResponse([
                    { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }
                ], 1, false));
                const config = { per_page: 5 };
                const paginator = (0, paginator_1.createPaginator)('/test', config, mockHttpClient);
                const batches = [];
                const processor = jest.fn().mockImplementation((batch) => {
                    batches.push([...batch]);
                    return Promise.resolve();
                });
                await (0, paginator_1.processBatches)(paginator, 2, processor);
                expect(processor).toHaveBeenCalledTimes(3); // 5 items with batch size 2 = 3 calls
                expect(batches[0]).toHaveLength(2); // First batch: [1, 2]
                expect(batches[1]).toHaveLength(2); // Second batch: [3, 4]  
                expect(batches[2]).toHaveLength(1); // Third batch: [5]
            });
        });
    });
});
//# sourceMappingURL=paginator.test.js.map
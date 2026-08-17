import { SALE_KINDS, KIND_WEIGHT, round3, round2 } from './utils.js'
import { applySaleToProducts } from './saleHandlers.js'
const HOUR = 1000 * 60 * 60

function getSaleWeight(sales) {
    const now = Date.now()
    return sales.map(sale => {
        const start = new Date(sale.start)
        return {
            ...sale,
            saleAge: Math.round((now - start.getTime()) / HOUR)
        }
    }).sort((a, b) => {
        let diff = KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind]
        if (a.kind === SALE_KINDS.PRICE && diff === 0) diff = b.amount - a.amount
        if (diff === 0) return a.saleAge - b.saleAge
        return diff
    })
}

function isSaleEligible(products, sale) {
    let saleAmount = sale.amount
    let orderSaleAmount = 0
    let orderSalePrice = 0
    let isSaleReceivePrice = sale.kind === SALE_KINDS.RECEIVE_PRICE
    let missingPrice = isSaleReceivePrice ? sale.price : 0.0

    for (const p of products) {
        const productAmount = Math.min(saleAmount, p.totalAvailableAmount)
        saleAmount -= productAmount
        orderSaleAmount += productAmount
        orderSalePrice += p.totalAvailableAmount * p.orderPrice
        missingPrice = Math.max(0, missingPrice - orderSalePrice)

        if (isSaleReceivePrice ? orderSalePrice >= sale.price : orderSaleAmount >= sale.amount) {
            return true
        }
    }
    return false
}

const sortSaleProductAsc = (p0, p1) => {
    const finalCheck = Boolean(p0.finalAmount) ^ Boolean(p1.finalAmount)
    if (finalCheck) return p0.finalAmount ? -1 : 1
    const diff = (p0.orderPrice || 0) - (p1.orderPrice || 0)
    return diff === 0 ? (p0.barcode > p1.barcode ? -1 : 1) : diff
}

const sortSaleProductDesc = (a, b) => sortSaleProductAsc(b, a)

function getSortedProducts(products, kind) {
    const sorted = [...products]
    if (kind === SALE_KINDS.RECEIVE_AMOUNT || kind === SALE_KINDS.RECEIVE_PRICE) {
        sorted.sort(sortSaleProductDesc)
    } else {
        sorted.sort(sortSaleProductAsc)
    }
    return sorted
}

export function applySales({ products, sales }) {
    const sortedSales = getSaleWeight(sales)
    const saleDetails = {}

    for (const sale of sortedSales) {
        let saleLimit = sale.limit ? Math.floor(sale.limit / sale.amount) : 1000

        const eligibleProducts = products.filter(p => sale.barcodes && sale.barcodes.includes(p.barcode))
        const receiveProducts = sale?.receive?.barcodes ?
            products.filter(p => sale.receive.barcodes.includes(p.barcode)) : []

        if (!eligibleProducts.length) continue

        const sortedEligible = getSortedProducts(eligibleProducts, sale.kind)
        const sortedReceive = receiveProducts.length > 1 ? [...receiveProducts].sort(sortSaleProductAsc) : receiveProducts

        for (let j = 0; j < saleLimit; j++) {
            if (!isSaleEligible(sortedEligible, sale)) break

            const result = applySaleToProducts({
                products: sortedEligible,
                receiveProducts: sortedReceive,
                sale
            })

            if (!result.success) break

            if (!saleDetails[sale.saleId]) {
                saleDetails[sale.saleId] = { used: true, amountToFulfill: 0 }
            }

            for (const dist of result.distributions) {
                const p = dist.product
                const d = {
                    amount: dist.saleAmount,
                    pricePerUnit: dist.salePricePerUnit,
                    sum: dist.sum,
                    saleId: sale.saleId,
                    saleKind: sale.kind,
                    saleName: sale.name,
                    salePrice: sale.price,
                    saleLimit: sale.limit,
                    saleAmount: sale.amount,
                    saleDescription: sale.displayName,
                    saleCode: sale.code,
                    saleReceivePrice: sale.receive?.price,
                    saleReceiveAmount: sale.receive?.amount,
                    isReceiveSaleProduct: dist.isReceiveSaleProduct,
                    isGiveSaleProduct: dist.isGiveSaleProduct,
                    isGiveProduct: dist.isGiveSaleProduct
                }
                p.pricesDistribution.push(d)
            }
        }
    }

    // Process leftover regular amount
    for (const p of products) {
        const distributedAmount = p.pricesDistribution.reduce((sum, d) => sum + d.amount, 0)
        const regularAmount = Math.max(0, p.amount - distributedAmount)

        if (regularAmount > 0) {
            p.pricesDistribution.push({
                amount: round3(regularAmount),
                pricePerUnit: p.orderPrice,
                sum: round2(regularAmount * p.orderPrice)
            })
        }

        p.pricesDistribution.sort((a, b) => (b.pricePerUnit || 0) - (a.pricePerUnit || 0))
    }

    return { processedProducts: products, saleDetails }
}

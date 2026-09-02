import ScanProduct from './ScanProduct'

export default function ProductPickModal({ product = {}, orderId, onClose, onPicked }) {
    const isScanned = product.finalAmount || product.missing
    // if !finalAmount -> display scan (camera) directly, if scanned -> display finalAmount modal
    const initialPhase = isScanned ? 'amount' : 'scanning'
    const initialSupplied = isScanned ? (product.missing ? '' : String(product.finalAmount ?? '')) : ''

    return <ScanProduct product={product} orderId={orderId} onClose={onClose} onPicked={onPicked} initialPhase={initialPhase} initialSupplied={initialSupplied} initialBarcode={product.barcode} />
}

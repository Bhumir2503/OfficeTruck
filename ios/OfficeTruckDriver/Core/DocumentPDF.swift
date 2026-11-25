import UIKit

/// Turns scanned pages or photos into one PDF, a page per image. Each image
/// is scaled down and JPEG-compressed first so a multi-page BOL stays well
/// under the bucket's 20 MB limit.
enum DocumentPDF {
    /// Points across a US Letter page.
    private static let pageWidth: CGFloat = 612
    /// Longest side kept from the camera, in pixels: sharp enough to read.
    private static let maxPixels: CGFloat = 2000

    static func make(from images: [UIImage]) -> Data? {
        let pages = images.compactMap(compressed)
        guard let first = pages.first else { return nil }

        let renderer = UIGraphicsPDFRenderer(bounds: pageRect(for: first))
        return renderer.pdfData { context in
            for page in pages {
                let rect = pageRect(for: page)
                context.beginPage(withBounds: rect, pageInfo: [:])
                page.draw(in: rect)
            }
        }
    }

    /// The page fits the image's shape at Letter width.
    private static func pageRect(for image: UIImage) -> CGRect {
        let ratio = image.size.height / max(image.size.width, 1)
        return CGRect(x: 0, y: 0, width: pageWidth, height: pageWidth * ratio)
    }

    private static func compressed(_ image: UIImage) -> UIImage? {
        let longest = max(image.size.width, image.size.height) * image.scale
        let scale = min(1, maxPixels / max(longest, 1))
        let size = CGSize(width: image.size.width * image.scale * scale, height: image.size.height * image.scale * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = resized.jpegData(compressionQuality: 0.6) else { return nil }
        return UIImage(data: jpeg)
    }
}

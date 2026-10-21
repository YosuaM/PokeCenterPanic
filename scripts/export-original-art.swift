import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
let sourceDirectory = root.appendingPathComponent("art/source", isDirectory: true)
let outputDirectory = CommandLine.arguments.count > 1 ?
  URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true) :
  root.appendingPathComponent("apps/client/public/assets/original", isDirectory: true)

func read(_ name: String) throws -> String {
  try String(contentsOf: sourceDirectory.appendingPathComponent(name), encoding: .utf8)
}

func section(_ source: String, from start: String, to end: String) -> String {
  guard let first = source.range(of: start),
        let last = source.range(of: end, range: first.upperBound..<source.endIndex) else {
    fatalError("Missing SVG layer marker: \(start) or \(end)")
  }
  return String(source[first.upperBound..<last.lowerBound])
}

func export(_ svg: String, as name: String, width: Int, height: Int) throws {
  guard let image = NSImage(data: Data(svg.utf8)),
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width,
                                      pixelsHigh: height, bitsPerSample: 8,
                                      samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                      colorSpaceName: .deviceRGB, bytesPerRow: 0,
                                      bitsPerPixel: 0),
        let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Cannot render original asset: \(name)")
  }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = .none
  image.draw(in: NSRect(x: 0, y: 0, width: width, height: height),
             from: NSRect(origin: .zero, size: image.size), operation: .copy, fraction: 1)
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()
  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Cannot encode original asset: \(name)")
  }
  try png.write(to: outputDirectory.appendingPathComponent("\(name).png"))
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let map = try read("center-map.svg")
guard let defsEnd = map.range(of: "  </defs>") else {
  fatalError("Missing center-map SVG definitions")
}
let prelude = String(map[..<defsEnd.upperBound])
let floor = section(map, from: "<!-- BEGIN FLOOR -->", to: "<!-- END FLOOR -->")
let fixtures = section(map, from: "<!-- BEGIN FIXTURES -->", to: "<!-- END FIXTURES -->")
try export(map, as: "center-map", width: 960, height: 540)
try export(prelude + floor + "</svg>", as: "center-floor", width: 960, height: 540)
try export(prelude + fixtures + "</svg>", as: "center-fixtures", width: 960, height: 540)
try export(try read("stretcher.svg"), as: "stretcher", width: 48, height: 24)
try export(try read("medicine-bottle.svg"), as: "medicine-bottle", width: 20, height: 28)

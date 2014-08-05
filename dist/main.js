(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\index.js","/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer")
},{"VCmEsw":4,"base64-js":2,"buffer":1,"ieee754":3}],2:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\base64-js\\lib\\b64.js","/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\base64-js\\lib")
},{"VCmEsw":4,"buffer":1}],3:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\ieee754\\index.js","/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\buffer\\node_modules\\ieee754")
},{"VCmEsw":4,"buffer":1}],4:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\process\\browser.js","/..\\node_modules\\gulp-browserify\\node_modules\\browserify\\node_modules\\process")
},{"VCmEsw":4,"buffer":1}],5:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var Sequence = require('./Sequence').Sequence;
var ImmutableMap = require('./Map');
var OrderedMap = require('./OrderedMap');
var ImmutableSet = require('./Set');
var Vector = require('./Vector');
var Range = require('./Range');
var Repeat = require('./Repeat');
var Record = require('./Record');


/**
 * The same semantics as Object.is(), but treats immutable sequences as
 * data, equal when the structure contains equivalent data.
 */
function is(first, second) {
  if (first === second) {
    return first !== 0 || second !== 0 || 1 / first === 1 / second;
  }
  if (first !== first) {
    return second !== second;
  }
  if (first instanceof Sequence) {
    return first.equals(second);
  }
  return false;
}

function fromJS(json, converter) {
  if (converter) {
    return fromJSWith(converter, json, '', {'': json});
  }
  return fromJSDefault(json);
}

function fromJSDefault(json) {
  if (json) {
    if (Array.isArray(json)) {
      return Sequence(json).map(fromJSDefault).toVector();
    }
    if (json.constructor === Object) {
      return Sequence(json).map(fromJSDefault).toMap();
    }
  }
  return json;
}

function fromJSWith(converter, json, key, parentJSON) {
  if (json && (Array.isArray(json) || json.constructor === Object)) {
    return converter.call(parentJSON, key, Sequence(json).map(function(v, k)  {return fromJSWith(converter, v, k, json);}));
  }
  return json;
}

exports.is = is;
exports.fromJS = fromJS;
exports.Sequence = Sequence;
exports.Range = Range;
exports.Repeat = Repeat;
exports.Vector = Vector;
exports.Map = ImmutableMap;
exports.OrderedMap = OrderedMap;
exports.Set = ImmutableSet;
exports.Record = Record;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Immutable.js","/..\\node_modules\\immutable\\dist")
},{"./Map":6,"./OrderedMap":7,"./Range":8,"./Record":9,"./Repeat":10,"./Sequence":11,"./Set":12,"./Vector":13,"VCmEsw":4,"buffer":1}],6:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var Sequence = require('./Sequence').Sequence;


for(var Sequence____Key in Sequence){if(Sequence.hasOwnProperty(Sequence____Key)){Map[Sequence____Key]=Sequence[Sequence____Key];}}var ____SuperProtoOfSequence=Sequence===null?null:Sequence.prototype;Map.prototype=Object.create(____SuperProtoOfSequence);Map.prototype.constructor=Map;Map.__superConstructor__=Sequence;

  // @pragma Construction

  function Map(sequence) {"use strict";
    if (sequence && sequence.constructor === Map) {
      return sequence;
    }
    if (!sequence || sequence.length === 0) {
      return Map.empty();
    }
    return Map.empty().merge(sequence);
  }

  Map.empty=function() {"use strict";
    return __EMPTY_MAP || (__EMPTY_MAP = Map.$Map_make(0));
  };

  Map.prototype.toString=function() {"use strict";
    return this.__toString('Map {', '}');
  };

  // @pragma Access

  Map.prototype.get=function(k, undefinedValue) {"use strict";
    if (k == null || this.$Map_root == null) {
      return undefinedValue;
    }
    return this.$Map_root.get(0, hashValue(k), k, undefinedValue);
  };

  // @pragma Modification

  Map.prototype.set=function(k, v) {"use strict";
    if (k == null) {
      return this;
    }
    var newLength = this.length;
    var newRoot;
    if (this.$Map_root) {
      var didAddLeaf = BoolRef();
      newRoot = this.$Map_root.set(this.__ownerID, 0, hashValue(k), k, v, didAddLeaf);
      didAddLeaf.value && newLength++;
    } else {
      newLength++;
      newRoot = makeNode(this.__ownerID, 0, hashValue(k), k, v);
    }
    if (this.__ownerID) {
      this.length = newLength;
      this.$Map_root = newRoot;
      return this;
    }
    return newRoot === this.$Map_root ? this : Map.$Map_make(newLength, newRoot);
  };

  Map.prototype.delete=function(k) {"use strict";
    if (k == null || this.$Map_root == null) {
      return this;
    }
    if (this.__ownerID) {
      var didRemoveLeaf = BoolRef();
      this.$Map_root = this.$Map_root.delete(this.__ownerID, 0, hashValue(k), k, didRemoveLeaf);
      didRemoveLeaf.value && this.length--;
      return this;
    }
    var newRoot = this.$Map_root.delete(this.__ownerID, 0, hashValue(k), k);
    return !newRoot ? Map.empty() : newRoot === this.$Map_root ? this : Map.$Map_make(this.length - 1, newRoot);
  };

  Map.prototype.clear=function() {"use strict";
    if (this.__ownerID) {
      this.length = 0;
      this.$Map_root = null;
      return this;
    }
    return Map.empty();
  };

  // @pragma Composition

  Map.prototype.merge=function() {"use strict";
    return mergeIntoMapWith(this, null, arguments);
  };

  Map.prototype.mergeWith=function(merger)  {"use strict";var seqs=Array.prototype.slice.call(arguments,1);
    return mergeIntoMapWith(this, merger, seqs);
  };

  Map.prototype.mergeDeep=function() {"use strict";
    return mergeIntoMapWith(this, deepMerger(null), arguments);
  };

  Map.prototype.mergeDeepWith=function(merger)  {"use strict";var seqs=Array.prototype.slice.call(arguments,1);
    return mergeIntoMapWith(this, deepMerger(merger), seqs);
  };

  Map.prototype.updateIn=function(keyPath, updater) {"use strict";
    return updateInDeepMap(this, keyPath, updater, 0);
  };

  // @pragma Mutability

  Map.prototype.withMutations=function(fn) {"use strict";
    var mutable = this.asMutable();
    fn(mutable);
    return mutable.__ensureOwner(this.__ownerID);
  };

  Map.prototype.asMutable=function() {"use strict";
    return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
  };

  Map.prototype.asImmutable=function() {"use strict";
    return this.__ensureOwner();
  };

  Map.prototype.__ensureOwner=function(ownerID) {"use strict";
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      this.__ownerID = ownerID;
      return this;
    }
    return Map.$Map_make(this.length, this.$Map_root, ownerID);
  };

  // @pragma Iteration

  Map.prototype.__deepEqual=function(other) {"use strict";
    var is = require('./Immutable').is;
    // Using Sentinel here ensures that a missing key is not interpretted as an
    // existing key set to be null.
    var self = this;
    return other.every(function(v, k)  {return is(self.get(k, __SENTINEL), v);});
  };

  Map.prototype.__iterate=function(fn, reverse) {"use strict";
    return this.$Map_root ? this.$Map_root.iterate(this, fn, reverse) : 0;
  };

  // @pragma Private

  Map.$Map_make=function(length, root, ownerID) {"use strict";
    var map = Object.create(Map.prototype);
    map.length = length;
    map.$Map_root = root;
    map.__ownerID = ownerID;
    return map;
  };


Map.from = Map;



  function OwnerID() {"use strict";}





  function BitmapIndexedNode(ownerID, bitmap, keys, values) {"use strict";
    this.ownerID = ownerID;
    this.bitmap = bitmap;
    this.keys = keys;
    this.values = values;
  }

  BitmapIndexedNode.prototype.get=function(shift, hash, key, notFound) {"use strict";
    var idx = (hash >>> shift) & MASK;
    if ((this.bitmap & (1 << idx)) === 0) {
      return notFound;
    }
    var keyOrNull = this.keys[idx];
    var valueOrNode = this.values[idx];
    if (keyOrNull == null) {
      return valueOrNode.get(shift + SHIFT, hash, key, notFound);
    }
    return key === keyOrNull ? valueOrNode : notFound;
  };

  BitmapIndexedNode.prototype.set=function(ownerID, shift, hash, key, value, didAddLeaf) {"use strict";
    var editable;
    var idx = (hash >>> shift) & MASK;
    var bit = 1 << idx;
    if ((this.bitmap & bit) === 0) {
      didAddLeaf && (didAddLeaf.value = true);
      editable = this.ensureOwner(ownerID);
      editable.keys[idx] = key;
      editable.values[idx] = value;
      editable.bitmap |= bit;
      return editable;
    }
    var keyOrNull = this.keys[idx];
    var valueOrNode = this.values[idx];
    var newNode;
    if (keyOrNull == null) {
      newNode = valueOrNode.set(ownerID, shift + SHIFT, hash, key, value, didAddLeaf);
      if (newNode === valueOrNode) {
        return this;
      }
      editable = this.ensureOwner(ownerID);
      editable.values[idx] = newNode;
      return editable;
    }
    if (key === keyOrNull) {
      if (value === valueOrNode) {
        return this;
      }
      editable = this.ensureOwner(ownerID);
      editable.values[idx] = value;
      return editable;
    }
    var originalHash = hashValue(keyOrNull);
    if (hash === originalHash) {
      newNode = new HashCollisionNode(ownerID, hash, [keyOrNull, key], [valueOrNode, value]);
    } else {
      newNode = makeNode(ownerID, shift + SHIFT, originalHash, keyOrNull, valueOrNode)
        .set(ownerID, shift + SHIFT, hash, key, value);
    }
    didAddLeaf && (didAddLeaf.value = true);
    editable = this.ensureOwner(ownerID);
    delete editable.keys[idx];
    editable.values[idx] = newNode;
    return editable;
  };

  BitmapIndexedNode.prototype.delete=function(ownerID, shift, hash, key, didRemoveLeaf) {"use strict";
    var editable;
    var idx = (hash >>> shift) & MASK;
    var bit = 1 << idx;
    var keyOrNull = this.keys[idx];
    if ((this.bitmap & bit) === 0 || (keyOrNull != null && key !== keyOrNull)) {
      return this;
    }
    if (keyOrNull == null) {
      var node = this.values[idx];
      var newNode = node.delete(ownerID, shift + SHIFT, hash, key, didRemoveLeaf);
      if (newNode === node) {
        return this;
      }
      if (newNode) {
        editable = this.ensureOwner(ownerID);
        editable.values[idx] = newNode;
        return editable;
      }
    } else {
      didRemoveLeaf && (didRemoveLeaf.value = true);
    }
    if (this.bitmap === bit) {
      return null;
    }
    editable = this.ensureOwner(ownerID);
    delete editable.keys[idx];
    delete editable.values[idx];
    editable.bitmap ^= bit;
    return editable;
  };

  BitmapIndexedNode.prototype.ensureOwner=function(ownerID) {"use strict";
    if (ownerID && ownerID === this.ownerID) {
      return this;
    }
    return new BitmapIndexedNode(ownerID, this.bitmap, this.keys.slice(), this.values.slice());
  };

  BitmapIndexedNode.prototype.iterate=function(map, fn, reverse) {"use strict";
    var values = this.values;
    var keys = this.keys;
    var maxIndex = values.length;
    for (var ii = 0; ii <= maxIndex; ii++) {
      var index = reverse ? maxIndex - ii : ii;
      var key = keys[index];
      var valueOrNode = values[index];
      if (key != null) {
        if (fn(valueOrNode, key, map) === false) {
          return false;
        }
      } else if (valueOrNode && !valueOrNode.iterate(map, fn, reverse)) {
        return false;
      }
    }
    return true;
  };





  function HashCollisionNode(ownerID, collisionHash, keys, values) {"use strict";
    this.ownerID = ownerID;
    this.collisionHash = collisionHash;
    this.keys = keys;
    this.values = values;
  }

  HashCollisionNode.prototype.get=function(shift, hash, key, notFound) {"use strict";
    var idx = Sequence(this.keys).indexOf(key);
    return idx === -1 ? notFound : this.values[idx];
  };

  HashCollisionNode.prototype.set=function(ownerID, shift, hash, key, value, didAddLeaf) {"use strict";
    if (hash !== this.collisionHash) {
      didAddLeaf && (didAddLeaf.value = true);
      return makeNode(ownerID, shift, hash, null, this)
        .set(ownerID, shift, hash, key, value);
    }
    var idx = Sequence(this.keys).indexOf(key);
    if (idx >= 0 && this.values[idx] === value) {
      return this;
    }
    var editable = this.ensureOwner(ownerID);
    if (idx === -1) {
      editable.keys.push(key);
      editable.values.push(value);
      didAddLeaf && (didAddLeaf.value = true);
    } else {
      editable.values[idx] = value;
    }
    return editable;
  };

  HashCollisionNode.prototype.delete=function(ownerID, shift, hash, key, didRemoveLeaf) {"use strict";
    var idx = this.keys.indexOf(key);
    if (idx === -1) {
      return this;
    }
    didRemoveLeaf && (didRemoveLeaf.value = true);
    if (this.values.length > 1) {
      var editable = this.ensureOwner(ownerID);
      editable.keys[idx] = editable.keys.pop();
      editable.values[idx] = editable.values.pop();
      return editable;
    }
  };

  HashCollisionNode.prototype.ensureOwner=function(ownerID) {"use strict";
    if (ownerID && ownerID === this.ownerID) {
      return this;
    }
    return new HashCollisionNode(ownerID, this.collisionHash, this.keys.slice(), this.values.slice());
  };

  HashCollisionNode.prototype.iterate=function(map, fn, reverse) {"use strict";
    var values = this.values;
    var keys = this.keys;
    var maxIndex = values.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      var index = reverse ? maxIndex - ii : ii;
      if (fn(values[index], keys[index], map) === false) {
        return false;
      }
    }
    return true;
  };



function makeNode(ownerID, shift, hash, key, valOrNode) {
  var idx = (hash >>> shift) & MASK;
  var keys = [];
  var values = [];
  values[idx] = valOrNode;
  key != null && (keys[idx] = key);
  return new BitmapIndexedNode(ownerID, 1 << idx, keys, values);
}

function deepMerger(merger) {
  return function(existing, value) 
    {return existing && existing.mergeDeepWith ?
      existing.mergeDeepWith(merger, value) :
      merger ? merger(existing, value) : value;};
}

function mergeIntoMapWith(map, merger, seqs) {
  if (seqs.length === 0) {
    return map;
  }
  return map.withMutations(function(map)  {
    for (var ii = 0; ii < seqs.length; ii++) {
      var seq = seqs[ii];
      if (seq) {
        seq = seq.forEach ? seq : Sequence(seq);
        seq.forEach(
          merger ?
          function(value, key)  {
            var existing = map.get(key, __SENTINEL);
            map.set(key, existing === __SENTINEL ? value : merger(existing, value));
          } :
          function(value, key)  {
            map.set(key, value);
          }
        );
      }
    }
  });
}

function updateInDeepMap(collection, keyPath, updater, pathOffset) {
  var key = keyPath[pathOffset];
  var nested = collection.get ? collection.get(key, __SENTINEL) : __SENTINEL;
  if (nested === __SENTINEL) {
    return collection;
  }
  return collection.set ? collection.set(
    key,
    pathOffset === keyPath.length - 1 ?
      updater(nested) :
      updateInDeepMap(nested, keyPath, updater, pathOffset + 1)
  ) : collection;
}

var __BOOL_REF = {value: false};
function BoolRef(value) {
  __BOOL_REF.value = value;
  return __BOOL_REF;
}

function hashValue(o) {
  if (!o) { // false, 0, and null
    return 0;
  }
  if (o === true) {
    return 1;
  }
  if (typeof o.hashCode === 'function') {
    return o.hashCode();
  }
  var type = typeof o;
  if (type === 'number') {
    return Math.floor(o) % 2147483647; // 2^31-1
  }
  if (type === 'string') {
    return hashString(o);
  }
  throw new Error('Unable to hash');
}

// http://jsperf.com/string-hash-to-int
function hashString(string) {
  var hash = STRING_HASH_CACHE[string];
  if (hash == null) {
    // This is the hash from JVM
    // The hash code for a string is computed as
    // s[0] * 31 ^ (n - 1) + s[1] * 31 ^ (n - 2) + ... + s[n - 1],
    // where s[i] is the ith character of the string and n is the length of
    // the string. We mod the result to make it between 0 (inclusive) and 2^32
    // (exclusive).
    hash = 0;
    for (var ii = 0; ii < string.length; ii++) {
      hash = (31 * hash + string.charCodeAt(ii)) % STRING_HASH_MAX_VAL;
    }
    if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
      STRING_HASH_CACHE_SIZE = 0;
      STRING_HASH_CACHE = {};
    }
    STRING_HASH_CACHE_SIZE++;
    STRING_HASH_CACHE[string] = hash;
  }
  return hash;
}


var STRING_HASH_MAX_VAL = 0x100000000; // 2^32
var STRING_HASH_CACHE_MAX_SIZE = 255;
var STRING_HASH_CACHE_SIZE = 0;
var STRING_HASH_CACHE = {};


var SHIFT = 5; // Resulted in best performance after ______?
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;
var __SENTINEL = {};
var __EMPTY_MAP;

module.exports = Map;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Map.js","/..\\node_modules\\immutable\\dist")
},{"./Immutable":5,"./Sequence":11,"VCmEsw":4,"buffer":1}],7:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var ImmutableMap = require('./Map');


for(var ImmutableMap____Key in ImmutableMap){if(ImmutableMap.hasOwnProperty(ImmutableMap____Key)){OrderedMap[ImmutableMap____Key]=ImmutableMap[ImmutableMap____Key];}}var ____SuperProtoOfImmutableMap=ImmutableMap===null?null:ImmutableMap.prototype;OrderedMap.prototype=Object.create(____SuperProtoOfImmutableMap);OrderedMap.prototype.constructor=OrderedMap;OrderedMap.__superConstructor__=ImmutableMap;

  // @pragma Construction

  function OrderedMap(sequence) {"use strict";
    if (sequence && sequence.constructor === OrderedMap) {
      return sequence;
    }
    if (!sequence || sequence.length === 0) {
      return OrderedMap.empty();
    }
    return OrderedMap.empty().merge(sequence);
  }

  OrderedMap.empty=function() {"use strict";
    return __EMPTY_ORDERED_MAP || (__EMPTY_ORDERED_MAP = OrderedMap.$OrderedMap_make());
  };

  OrderedMap.prototype.toString=function() {"use strict";
    return this.__toString('OrderedMap {', '}');
  };

  // @pragma Access

  OrderedMap.prototype.get=function(k, undefinedValue) {"use strict";
    if (k != null && this.$OrderedMap_map) {
      var index = this.$OrderedMap_map.get(k);
      if (index != null) {
        return this.$OrderedMap_vector.get(index)[1];
      }
    }
    return undefinedValue;
  };

  // @pragma Modification

  OrderedMap.prototype.clear=function() {"use strict";
    if (this.__ownerID) {
      this.length = 0;
      this.$OrderedMap_map = this.$OrderedMap_vector = null;
      return this;
    }
    return OrderedMap.empty();
  };

  OrderedMap.prototype.set=function(k, v) {"use strict";
    if (k == null) {
      return this;
    }
    var newMap = this.$OrderedMap_map;
    var newVector = this.$OrderedMap_vector;
    if (newMap) {
      var index = newMap.get(k);
      if (index == null) {
        newMap = newMap.set(k, newVector.length);
        newVector = newVector.push([k, v]);
      } else if (newVector.get(index)[1] !== v) {
        newVector = newVector.set(index, [k, v]);
      }
    } else {
      newVector = require('./Vector').empty().__ensureOwner(this.__ownerID).set(0, [k, v]);
      newMap = ImmutableMap.empty().__ensureOwner(this.__ownerID).set(k, 0);
    }
    if (this.__ownerID) {
      this.length = newMap.length;
      this.$OrderedMap_map = newMap;
      this.$OrderedMap_vector = newVector;
      return this;
    }
    return newVector === this.$OrderedMap_vector ? this : OrderedMap.$OrderedMap_make(newMap, newVector);
  };

  OrderedMap.prototype.delete=function(k) {"use strict";
    if (k == null || this.$OrderedMap_map == null) {
      return this;
    }
    var index = this.$OrderedMap_map.get(k);
    if (index == null) {
      return this;
    }
    var newMap = this.$OrderedMap_map.delete(k);
    var newVector = this.$OrderedMap_vector.delete(index);

    if (newMap.length === 0) {
      return this.clear();
    }
    if (this.__ownerID) {
      this.length = newMap.length;
      this.$OrderedMap_map = newMap;
      this.$OrderedMap_vector = newVector;
      return this;
    }
    return newMap === this.$OrderedMap_map ? this : OrderedMap.$OrderedMap_make(newMap, newVector);
  };

  // @pragma Mutability

  OrderedMap.prototype.__ensureOwner=function(ownerID) {"use strict";
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this.$OrderedMap_map && this.$OrderedMap_map.__ensureOwner(ownerID);
    var newVector = this.$OrderedMap_vector && this.$OrderedMap_vector.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this.$OrderedMap_map = newMap;
      this.$OrderedMap_vector = newVector;
      return this;
    }
    return OrderedMap.$OrderedMap_make(newMap, newVector, ownerID);
  };


  // @pragma Iteration

  OrderedMap.prototype.__deepEqual=function(other) {"use strict";
    var is = require('./Immutable').is;
    var iterator = this.$OrderedMap_vector.__iterator__();
    return other.every(function(v, k)  {
      var entry = iterator.next();
      entry && (entry = entry[1]);
      return entry && is(k, entry[0]) && is(v, entry[1]);
    });
  };

  OrderedMap.prototype.__iterate=function(fn, reverse) {"use strict";
    return this.$OrderedMap_vector ? this.$OrderedMap_vector.fromEntries().__iterate(fn, reverse) : 0;
  };

  // @pragma Private

  OrderedMap.$OrderedMap_make=function(map, vector, ownerID) {"use strict";
    var omap = Object.create(OrderedMap.prototype);
    omap.length = map ? map.length : 0;
    omap.$OrderedMap_map = map;
    omap.$OrderedMap_vector = vector;
    omap.__ownerID = ownerID;
    return omap;
  };


OrderedMap.from = OrderedMap;


var __EMPTY_ORDERED_MAP;

module.exports = OrderedMap;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\OrderedMap.js","/..\\node_modules\\immutable\\dist")
},{"./Immutable":5,"./Map":6,"./Vector":13,"VCmEsw":4,"buffer":1}],8:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var IndexedSequence = require('./Sequence').IndexedSequence;
var Vector = require('./Vector');


/**
 * Returns a lazy seq of nums from start (inclusive) to end
 * (exclusive), by step, where start defaults to 0, step to 1, and end to
 * infinity. When start is equal to end, returns empty list.
 */
for(var IndexedSequence____Key in IndexedSequence){if(IndexedSequence.hasOwnProperty(IndexedSequence____Key)){Range[IndexedSequence____Key]=IndexedSequence[IndexedSequence____Key];}}var ____SuperProtoOfIndexedSequence=IndexedSequence===null?null:IndexedSequence.prototype;Range.prototype=Object.create(____SuperProtoOfIndexedSequence);Range.prototype.constructor=Range;Range.__superConstructor__=IndexedSequence;

  function Range(start, end, step) {"use strict";
    if (!(this instanceof Range)) {
      return new Range(start, end, step);
    }
    invariant(step !== 0, 'Cannot step a Range by 0');
    start = start || 0;
    if (end == null) {
      end = Infinity;
    }
    step = step == null ? 1 : Math.abs(step);
    if (end < start) {
      step = -step;
    }
    this.$Range_start = start;
    this.$Range_end = end;
    this.$Range_step = step;
    this.length = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
  }

  Range.prototype.toString=function() {"use strict";
    if (this.length === 0) {
      return 'Range []';
    }
    return 'Range [ ' +
      this.$Range_start + '...' + this.$Range_end +
      (this.$Range_step > 1 ? ' by ' + this.$Range_step : '') +
    ' ]';
  };

  Range.prototype.has=function(index) {"use strict";
    invariant(index >= 0, 'Index out of bounds');
    return index < this.length;
  };

  Range.prototype.get=function(index, undefinedValue) {"use strict";
    invariant(index >= 0, 'Index out of bounds');
    return this.length === Infinity || index < this.length ?
      this.$Range_start + index * this.$Range_step : undefinedValue;
  };

  Range.prototype.contains=function(searchValue) {"use strict";
    var possibleIndex = (searchValue - this.$Range_start) / this.$Range_step;
    return possibleIndex >= 0 &&
      possibleIndex < this.length &&
      possibleIndex === Math.floor(possibleIndex);
  };

  Range.prototype.slice=function(begin, end, maintainIndices) {"use strict";
    if (maintainIndices) {
      return ____SuperProtoOfIndexedSequence.slice.call(this,begin, end, maintainIndices);
    }
    begin = begin < 0 ? Math.max(0, this.length + begin) : Math.min(this.length, begin);
    end = end == null ? this.length : end > 0 ? Math.min(this.length, end) : Math.max(0, this.length + end);
    return new Range(this.get(begin), end === this.length ? this.$Range_end : this.get(end), this.$Range_step);
  };

  Range.prototype.__deepEquals=function(other) {"use strict";
    return this.$Range_start === other.$Range_start && this.$Range_end === other.$Range_end && this.$Range_step === other.$Range_step;
  };

  Range.prototype.indexOf=function(searchValue) {"use strict";
    var offsetValue = searchValue - this.$Range_start;
    if (offsetValue % this.$Range_step === 0) {
      var index = offsetValue / this.$Range_step;
      if (index >= 0 && index < this.length) {
        return index
      }
    }
    return -1;
  };

  Range.prototype.lastIndexOf=function(searchValue) {"use strict";
    return this.indexOf(searchValue);
  };

  Range.prototype.take=function(amount) {"use strict";
    return this.slice(0, amount);
  };

  Range.prototype.skip=function(amount, maintainIndices) {"use strict";
    return maintainIndices ? ____SuperProtoOfIndexedSequence.skip.call(this,amount) : this.slice(amount);
  };

  Range.prototype.__iterate=function(fn, reverse, flipIndices) {"use strict";
    var reversedIndices = reverse ^ flipIndices;
    var maxIndex = this.length - 1;
    var step = this.$Range_step;
    var value = reverse ? this.$Range_start + maxIndex * step : this.$Range_start;
    for (var ii = 0; ii <= maxIndex; ii++) {
      if (fn(value, reversedIndices ? maxIndex - ii : ii, this) === false) {
        break;
      }
      value += reverse ? -step : step;
    }
    return reversedIndices ? this.length : ii;
  };


Range.prototype.__toJS = Range.prototype.toArray;
Range.prototype.first = Vector.prototype.first;
Range.prototype.last = Vector.prototype.last;


function invariant(condition, error) {
  if (!condition) throw new Error(error);
}


module.exports = Range;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Range.js","/..\\node_modules\\immutable\\dist")
},{"./Sequence":11,"./Vector":13,"VCmEsw":4,"buffer":1}],9:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var Sequence = require('./Sequence').Sequence;
var ImmutableMap = require('./Map');


for(var Sequence____Key in Sequence){if(Sequence.hasOwnProperty(Sequence____Key)){Record[Sequence____Key]=Sequence[Sequence____Key];}}var ____SuperProtoOfSequence=Sequence===null?null:Sequence.prototype;Record.prototype=Object.create(____SuperProtoOfSequence);Record.prototype.constructor=Record;Record.__superConstructor__=Sequence;

  function Record(defaultValues, name) {"use strict";
    var RecordType = function(values) {
      this.$Record_map = ImmutableMap(values);
    };
    defaultValues = Sequence(defaultValues);
    RecordType.prototype = Object.create(Record.prototype);
    RecordType.prototype.constructor = RecordType;
    RecordType.prototype.$Record_name = name;
    RecordType.prototype.$Record_defaultValues = defaultValues;

    var keys = Object.keys(defaultValues);
    RecordType.prototype.length = keys.length;
    if (Object.defineProperty) {
      defaultValues.forEach(function(_, key)  {
        Object.defineProperty(RecordType.prototype, key, {
          get: function() {
            return this.get(key);
          },
          set: function(value) {
            if (!this.__ownerID) {
              throw new Error('Cannot set on an immutable record.');
            }
            this.set(key, value);
          }
        });
      }.bind(this));
    }

    return RecordType;
  }

  Record.prototype.toString=function() {"use strict";
    return this.__toString((this.$Record_name || 'Record') + ' {', '}');
  };

  // @pragma Access

  Record.prototype.has=function(k) {"use strict";
    return this.$Record_defaultValues.has(k);
  };

  Record.prototype.get=function(k, undefinedValue) {"use strict";
    if (undefinedValue !== undefined && !this.has(k)) {
      return undefinedValue;
    }
    return this.$Record_map.get(k, this.$Record_defaultValues.get(k));
  };

  // @pragma Modification

  Record.prototype.clear=function() {"use strict";
    if (this.__ownerID) {
      this.$Record_map.clear();
      return this;
    }
    return this.$Record_empty();
  };

  Record.prototype.set=function(k, v) {"use strict";
    if (k == null || !this.has(k)) {
      return this;
    }
    var newMap = this.$Record_map.set(k, v);
    if (this.__ownerID || newMap === this.$Record_map) {
      return this;
    }
    return this.$Record_make(newMap);
  };

  Record.prototype.delete=function(k) {"use strict";
    if (k == null || !this.has(k)) {
      return this;
    }
    var newMap = this.$Record_map.delete(k);
    if (this.__ownerID || newMap === this.$Record_map) {
      return this;
    }
    return this.$Record_make(newMap);
  };

  // @pragma Mutability

  Record.prototype.__ensureOwner=function(ownerID) {"use strict";
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this.$Record_map && this.$Record_map.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this.$Record_map = newMap;
      return this;
    }
    return this.$Record_make(newMap, ownerID);
  };

  // @pragma Iteration

  Record.prototype.__iterate=function(fn, reverse) {"use strict";
    var record = this;
    return this.$Record_defaultValues.map(function(_, k)  {return record.get(k);}).__iterate(fn, reverse);
  };

  Record.prototype.$Record_empty=function() {"use strict";
    var Record = Object.getPrototypeOf(this).constructor;
    return Record.$Record_empty || (Record.$Record_empty = this.$Record_make(ImmutableMap.empty()));
  };

  Record.prototype.$Record_make=function(map, ownerID) {"use strict";
    var record = Object.create(Object.getPrototypeOf(this));
    record.$Record_map = map;
    record.__ownerID = ownerID;
    return record;
  };


Record.prototype.__deepEqual = ImmutableMap.prototype.__deepEqual;
Record.prototype.merge = ImmutableMap.prototype.merge;
Record.prototype.mergeWith = ImmutableMap.prototype.mergeWith;
Record.prototype.mergeDeep = ImmutableMap.prototype.mergeDeep;
Record.prototype.mergeDeepWith = ImmutableMap.prototype.mergeDeepWith;
Record.prototype.updateIn = ImmutableMap.prototype.updateIn;
Record.prototype.withMutations = ImmutableMap.prototype.withMutations;
Record.prototype.asMutable = ImmutableMap.prototype.asMutable;
Record.prototype.asImmutable = ImmutableMap.prototype.asImmutable;


module.exports = Record;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Record.js","/..\\node_modules\\immutable\\dist")
},{"./Map":6,"./Sequence":11,"VCmEsw":4,"buffer":1}],10:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var IndexedSequence = require('./Sequence').IndexedSequence;
var Range = require('./Range');


/**
 * Returns a lazy seq of `value` repeated `times` times. When `times` is
 * undefined, returns an infinite sequence of `value`.
 */
for(var IndexedSequence____Key in IndexedSequence){if(IndexedSequence.hasOwnProperty(IndexedSequence____Key)){Repeat[IndexedSequence____Key]=IndexedSequence[IndexedSequence____Key];}}var ____SuperProtoOfIndexedSequence=IndexedSequence===null?null:IndexedSequence.prototype;Repeat.prototype=Object.create(____SuperProtoOfIndexedSequence);Repeat.prototype.constructor=Repeat;Repeat.__superConstructor__=IndexedSequence;

  function Repeat(value, times) {"use strict";
    if (times === 0 && __EMPTY_REPEAT) {
      return __EMPTY_REPEAT;
    }
    if (!(this instanceof Repeat)) {
      return new Repeat(value, times);
    }
    this.$Repeat_value = value;
    this.length = times == null ? Infinity : Math.max(0, times);
  }

  Repeat.prototype.toString=function() {"use strict";
    if (this.length === 0) {
      return 'Repeat []';
    }
    return 'Repeat [ ' + this.$Repeat_value + ' ' + this.length + ' times ]';
  };

  Repeat.prototype.get=function(index, undefinedValue) {"use strict";
    invariant(index >= 0, 'Index out of bounds');
    return this.length === Infinity || index < this.length ?
      this.$Repeat_value :
      undefinedValue;
  };

  Repeat.prototype.first=function() {"use strict";
    return this.$Repeat_value;
  };

  Repeat.prototype.contains=function(searchValue) {"use strict";
    var is = require('./Immutable').is;
    return is(this.$Repeat_value, searchValue);
  };

  Repeat.prototype.__deepEquals=function(other) {"use strict";
    var is = require('./Immutable').is;
    return is(this.$Repeat_value, other.$Repeat_value);
  };

  Repeat.prototype.slice=function(begin, end, maintainIndices) {"use strict";
    if (maintainIndices) {
      return ____SuperProtoOfIndexedSequence.slice.call(this,begin, end, maintainIndices);
    }
    var length = this.length;
    begin = begin < 0 ? Math.max(0, length + begin) : Math.min(length, begin);
    end = end == null ? length : end > 0 ? Math.min(length, end) : Math.max(0, length + end);
    return end > begin ? new Repeat(this.$Repeat_value, end - begin) : __EMPTY_REPEAT;
  };

  Repeat.prototype.reverse=function(maintainIndices) {"use strict";
    return maintainIndices ? ____SuperProtoOfIndexedSequence.reverse.call(this,maintainIndices) : this;
  };

  Repeat.prototype.indexOf=function(searchValue) {"use strict";
    var is = require('./Immutable').is;
    if (is(this.$Repeat_value, searchValue)) {
      return 0;
    }
    return -1;
  };

  Repeat.prototype.lastIndexOf=function(searchValue) {"use strict";
    var is = require('./Immutable').is;
    if (is(this.$Repeat_value, searchValue)) {
      return this.length;
    }
    return -1;
  };

  Repeat.prototype.__iterate=function(fn, reverse, flipIndices) {"use strict";
    var reversedIndices = reverse ^ flipIndices;
    invariant(!reversedIndices || this.length < Infinity, 'Cannot access end of infinite range.');
    var maxIndex = this.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      if (fn(this.$Repeat_value, reversedIndices ? maxIndex - ii : ii, this) === false) {
        break;
      }
    }
    return reversedIndices ? this.length : ii;
  };


Repeat.prototype.has = Range.prototype.has;
Repeat.prototype.toArray = Range.prototype.toArray;
Repeat.prototype.toObject = Range.prototype.toObject;
Repeat.prototype.toVector = Range.prototype.toVector;
Repeat.prototype.toMap = Range.prototype.toMap;
Repeat.prototype.toOrderedMap = Range.prototype.toOrderedMap;
Repeat.prototype.toSet = Range.prototype.toSet;
Repeat.prototype.take = Range.prototype.take;
Repeat.prototype.skip = Range.prototype.skip;
Repeat.prototype.last = Repeat.prototype.first;
Repeat.prototype.__toJS = Range.prototype.__toJS;


function invariant(condition, error) {
  if (!condition) throw new Error(error);
}


var __EMPTY_REPEAT = new Repeat(undefined, 0);

module.exports = Repeat;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Repeat.js","/..\\node_modules\\immutable\\dist")
},{"./Immutable":5,"./Range":8,"./Sequence":11,"VCmEsw":4,"buffer":1}],11:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var Immutable = require('./Immutable');



  function Sequence(value) {"use strict";
    return Sequence.from(
      arguments.length === 1 ? value : Array.prototype.slice.call(arguments)
    );
  }

  Sequence.from=function(value) {"use strict";
    if (value instanceof Sequence) {
      return value;
    }
    if (!Array.isArray(value)) {
      if (value && value.constructor === Object) {
        return new ObjectSequence(value);
      }
      value = [value];
    }
    return new ArraySequence(value);
  };

  Sequence.prototype.toString=function() {"use strict";
    return this.__toString('Seq {', '}');
  };

  Sequence.prototype.__toString=function(head, tail) {"use strict";
    if (this.length === 0) {
      return head + tail;
    }
    return head + ' ' + this.map(this.__toStringMapper).join(', ') + ' ' + tail;
  };

  Sequence.prototype.__toStringMapper=function(v, k) {"use strict";
    return k + ': ' + quoteString(v);
  };

  Sequence.prototype.toJS=function() {"use strict";
    return this.map(function(value)  {return value instanceof Sequence ? value.toJS() : value;}).__toJS();
  };

  Sequence.prototype.toArray=function() {"use strict";
    assertNotInfinite(this.length);
    var array = new Array(this.length || 0);
    this.values().forEach(function(v, i)  { array[i] = v; });
    return array;
  };

  Sequence.prototype.toObject=function() {"use strict";
    assertNotInfinite(this.length);
    var object = {};
    this.forEach(function(v, k)  { object[k] = v; });
    return object;
  };

  Sequence.prototype.toVector=function() {"use strict";
    // Use Late Binding here to solve the circular dependency.
    assertNotInfinite(this.length);
    return require('./Vector').from(this);
  };

  Sequence.prototype.toMap=function() {"use strict";
    // Use Late Binding here to solve the circular dependency.
    assertNotInfinite(this.length);
    return require('./Map').from(this);
  };

  Sequence.prototype.toOrderedMap=function() {"use strict";
    // Use Late Binding here to solve the circular dependency.
    assertNotInfinite(this.length);
    return require('./OrderedMap').from(this);
  };

  Sequence.prototype.toSet=function() {"use strict";
    // Use Late Binding here to solve the circular dependency.
    assertNotInfinite(this.length);
    return require('./Set').from(this);
  };

  Sequence.prototype.equals=function(other) {"use strict";
    if (this === other) {
      return true;
    }
    if (!(other instanceof Sequence)) {
      return false;
    }
    if (this.length != null && other.length != null) {
      if (this.length !== other.length) {
        return false;
      }
      if (this.length === 0 && other.length === 0) {
        return true;
      }
    }
    return this.__deepEquals(other);
  };

  Sequence.prototype.__deepEquals=function(other) {"use strict";
    var entries = this.cacheResult().entries().toArray();
    var iterations = 0;
    return other.every(function(v, k)  {
      var entry = entries[iterations++];
      return Immutable.is(k, entry[0]) && Immutable.is(v, entry[1]);
    });
  };

  Sequence.prototype.join=function(separator) {"use strict";
    separator = separator || ',';
    var string = '';
    var isFirst = true;
    this.forEach(function(v, k)  {
      if (isFirst) {
        isFirst = false;
        string += v;
      } else {
        string += separator + v;
      }
    });
    return string;
  };

  Sequence.prototype.concat=function() {"use strict";var values=Array.prototype.slice.call(arguments,0);
    var sequences = [this].concat(values.map(function(value)  {return Sequence(value);}));
    var concatSequence = this.__makeSequence();
    concatSequence.length = sequences.reduce(
      function(sum, seq)  {return sum != null && seq.length != null ? sum + seq.length : undefined;}, 0
    );
    concatSequence.__iterateUncached = function(fn, reverse)  {
      var iterations = 0;
      var stoppedIteration;
      var lastIndex = sequences.length - 1;
      for (var ii = 0; ii <= lastIndex && !stoppedIteration; ii++) {
        var seq = sequences[reverse ? lastIndex - ii : ii];
        iterations += seq.__iterate(function(v, k, c)  {
          if (fn(v, k, c) === false) {
            stoppedIteration = true;
            return false;
          }
        }, reverse);
      }
      return iterations;
    };
    return concatSequence;
  };

  Sequence.prototype.reverse=function(maintainIndices) {"use strict";
    var sequence = this;
    var reversedSequence = sequence.__makeSequence();
    reversedSequence.length = sequence.length;
    reversedSequence.__iterateUncached = function(fn, reverse)  {return sequence.__iterate(fn, !reverse);};
    reversedSequence.reverse = function()  {return sequence;};
    return reversedSequence;
  };

  Sequence.prototype.keys=function() {"use strict";
    return this.flip().values();
  };

  Sequence.prototype.values=function() {"use strict";
    // values() always returns an IndexedSequence.
    var sequence = this;
    var valuesSequence = makeIndexedSequence(sequence);
    valuesSequence.length = sequence.length;
    valuesSequence.values = returnThis;
    valuesSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (flipIndices && this.length == null) {
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      var predicate;
      if (flipIndices) {
        iterations = this.length - 1;
        predicate = function(v, k, c)  {return fn(v, iterations--, c) !== false;};
      } else {
        predicate = function(v, k, c)  {return fn(v, iterations++, c) !== false;};
      }
      sequence.__iterate(predicate, reverse); // intentionally do not pass flipIndices
      return flipIndices ? this.length : iterations;
    }
    return valuesSequence;
  };

  Sequence.prototype.entries=function() {"use strict";
    var sequence = this;
    if (sequence.$Sequence_cache) {
      // We cache as an entries array, so we can just return the cache!
      return Sequence(sequence.$Sequence_cache);
    }
    var entriesSequence = sequence.map(entryMapper).values();
    entriesSequence.fromEntries = function()  {return sequence;};
    return entriesSequence;
  };

  Sequence.prototype.forEach=function(sideEffect, thisArg) {"use strict";
    return this.__iterate(thisArg ? sideEffect.bind(thisArg) : sideEffect);
  };

  Sequence.prototype.reduce=function(reducer, initialReduction, thisArg) {"use strict";
    var reduction = initialReduction;
    this.forEach(function(v, k, c)  {
      reduction = reducer.call(thisArg, reduction, v, k, c);
    });
    return reduction;
  };

  Sequence.prototype.reduceRight=function(reducer, initialReduction, thisArg) {"use strict";
    return this.reverse(true).reduce(reducer, initialReduction, thisArg);
  };

  Sequence.prototype.every=function(predicate, thisArg) {"use strict";
    var returnValue = true;
    this.forEach(function(v, k, c)  {
      if (!predicate.call(thisArg, v, k, c)) {
        returnValue = false;
        return false;
      }
    });
    return returnValue;
  };

  Sequence.prototype.some=function(predicate, thisArg) {"use strict";
    return !this.every(not(predicate), thisArg);
  };

  Sequence.prototype.first=function() {"use strict";
    return this.find(returnTrue);
  };

  Sequence.prototype.last=function() {"use strict";
    return this.findLast(returnTrue);
  };

  Sequence.prototype.has=function(searchKey) {"use strict";
    return this.get(searchKey, __SENTINEL) !== __SENTINEL;
  };

  Sequence.prototype.get=function(searchKey, notFoundValue) {"use strict";
    return this.find(function(_, key)  {return Immutable.is(key, searchKey);}, null, notFoundValue);
  };

  Sequence.prototype.getIn=function(searchKeyPath, notFoundValue) {"use strict";
    return getInDeepSequence(this, searchKeyPath, notFoundValue, 0);
  };

  Sequence.prototype.contains=function(searchValue) {"use strict";
    return this.find(function(value)  {return Immutable.is(value, searchValue);}, null, __SENTINEL) !== __SENTINEL;
  };

  Sequence.prototype.find=function(predicate, thisArg, notFoundValue) {"use strict";
    var foundValue = notFoundValue;
    this.forEach(function(v, k, c)  {
      if (predicate.call(thisArg, v, k, c)) {
        foundValue = v;
        return false;
      }
    });
    return foundValue;
  };

  Sequence.prototype.findKey=function(predicate, thisArg) {"use strict";
    var foundKey;
    this.forEach(function(v, k, c)  {
      if (predicate.call(thisArg, v, k, c)) {
        foundKey = k;
        return false;
      }
    });
    return foundKey;
  };

  Sequence.prototype.findLast=function(predicate, thisArg, notFoundValue) {"use strict";
    return this.reverse(true).find(predicate, thisArg, notFoundValue);
  };

  Sequence.prototype.findLastKey=function(predicate, thisArg) {"use strict";
    return this.reverse(true).findKey(predicate, thisArg);
  };

  Sequence.prototype.flip=function() {"use strict";
    // flip() always returns a non-indexed Sequence.
    var sequence = this;
    var flipSequence = makeSequence();
    flipSequence.length = sequence.length;
    flipSequence.flip = function()  {return sequence;};
    flipSequence.__iterateUncached = function(fn, reverse) 
      {return sequence.__iterate(function(v, k, c)  {return fn(k, v, c) !== false;}, reverse);};
    return flipSequence;
  };

  Sequence.prototype.map=function(mapper, thisArg) {"use strict";
    var sequence = this;
    var mappedSequence = sequence.__makeSequence();
    mappedSequence.length = sequence.length;
    mappedSequence.__iterateUncached = function(fn, reverse) 
      {return sequence.__iterate(function(v, k, c)  {return fn(mapper.call(thisArg, v, k, c), k, c) !== false;}, reverse);};
    return mappedSequence;
  };

  Sequence.prototype.filter=function(predicate, thisArg) {"use strict";
    return filterFactory(this, predicate, thisArg, true, false);
  };

  Sequence.prototype.slice=function(begin, end) {"use strict";
    if (wholeSlice(begin, end, this.length)) {
      return this;
    }
    var resolvedBegin = resolveBegin(begin, this.length);
    var resolvedEnd = resolveEnd(end, this.length);
    // begin or end will be NaN if they were provided as negative numbers and
    // this sequence's length is unknown. In that case, convert it to an
    // IndexedSequence by getting entries() and convert back to a sequence with
    // fromEntries(). IndexedSequence.prototype.slice will appropriately handle
    // this case.
    if (resolvedBegin !== resolvedBegin || resolvedEnd !== resolvedEnd) {
      return this.entries().slice(begin, end).fromEntries();
    }
    var skipped = resolvedBegin === 0 ? this : this.skip(resolvedBegin);
    return resolvedEnd == null || resolvedEnd === this.length ?
      skipped : skipped.take(resolvedEnd - resolvedBegin);
  };

  Sequence.prototype.take=function(amount) {"use strict";
    var iterations = 0;
    var sequence = this.takeWhile(function()  {return iterations++ < amount;});
    sequence.length = this.length && Math.min(this.length, amount);
    return sequence;
  };

  Sequence.prototype.takeLast=function(amount, maintainIndices) {"use strict";
    return this.reverse(maintainIndices).take(amount).reverse(maintainIndices);
  };

  Sequence.prototype.takeWhile=function(predicate, thisArg, maintainIndices) {"use strict";
    var sequence = this;
    var takeSequence = sequence.__makeSequence();
    takeSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      sequence.__iterate(function(v, k, c)  {
        if (predicate.call(thisArg, v, k, c) && fn(v, k, c) !== false) {
          iterations++;
        } else {
          return false;
        }
      }, reverse, flipIndices);
      return iterations;
    };
    return takeSequence;
  };

  Sequence.prototype.takeUntil=function(predicate, thisArg, maintainIndices) {"use strict";
    return this.takeWhile(not(predicate), thisArg, maintainIndices);
  };

  Sequence.prototype.skip=function(amount, maintainIndices) {"use strict";
    if (amount === 0) {
      return this;
    }
    var iterations = 0;
    var sequence = this.skipWhile(function()  {return iterations++ < amount;}, null, maintainIndices);
    sequence.length = this.length && Math.max(0, this.length - amount);
    return sequence;
  };

  Sequence.prototype.skipLast=function(amount, maintainIndices) {"use strict";
    return this.reverse(maintainIndices).skip(amount).reverse(maintainIndices);
  };

  Sequence.prototype.skipWhile=function(predicate, thisArg, maintainIndices) {"use strict";
    var sequence = this;
    var skipSequence = sequence.__makeSequence();
    skipSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var isSkipping = true;
      var iterations = 0;
      sequence.__iterate(function(v, k, c)  {
        if (!(isSkipping && (isSkipping = predicate.call(thisArg, v, k, c)))) {
          if (fn(v, k, c) !== false) {
            iterations++;
          } else {
            return false;
          }
        }
      }, reverse, flipIndices);
      return iterations;
    };
    return skipSequence;
  };

  Sequence.prototype.skipUntil=function(predicate, thisArg, maintainIndices) {"use strict";
    return this.skipWhile(not(predicate), thisArg, maintainIndices);
  };

  Sequence.prototype.groupBy=function(mapper, context) {"use strict";
    var seq = this;
    var groups = require('./OrderedMap').empty().withMutations(function(map)  {
      seq.forEach(function(value, key, collection)  {
        var groupKey = mapper(value, key, collection);
        var group = map.get(groupKey, __SENTINEL);
        if (group === __SENTINEL) {
          group = [];
          map.set(groupKey, group);
        }
        group.push([key, value]);
      });
    })
    return groups.map(function(group)  {return Sequence(group).fromEntries();});
  };

  Sequence.prototype.cacheResult=function() {"use strict";
    if (!this.$Sequence_cache && this.__iterateUncached) {
      assertNotInfinite(this.length);
      this.$Sequence_cache = this.entries().toArray();
      if (this.length == null) {
        this.length = this.$Sequence_cache.length;
      }
    }
    return this;
  };

  // abstract __iterateUncached(fn, reverse)

  Sequence.prototype.__iterate=function(fn, reverse, flipIndices) {"use strict";
    if (!this.$Sequence_cache) {
      return this.__iterateUncached(fn, reverse, flipIndices);
    }
    var maxIndex = this.length - 1;
    var cache = this.$Sequence_cache;
    var c = this;
    if (reverse) {
      for (var ii = cache.length - 1; ii >= 0; ii--) {
        var revEntry = cache[ii];
        if (fn(revEntry[1], flipIndices ? revEntry[0] : maxIndex - revEntry[0], c) === false) {
          break;
        }
      }
    } else {
      cache.every(flipIndices ?
        function(entry)  {return fn(entry[1], maxIndex - entry[0], c) !== false;} :
        function(entry)  {return fn(entry[1], entry[0], c) !== false;}
      );
    }
    return this.length;
  };

  Sequence.prototype.__makeSequence=function() {"use strict";
    return makeSequence();
  };


Sequence.prototype.toJSON = Sequence.prototype.toJS;
Sequence.prototype.inspect = Sequence.prototype.toSource = function() { return this.toString(); };
Sequence.prototype.__toJS = Sequence.prototype.toObject;


for(var Sequence____Key in Sequence){if(Sequence.hasOwnProperty(Sequence____Key)){IndexedSequence[Sequence____Key]=Sequence[Sequence____Key];}}var ____SuperProtoOfSequence=Sequence===null?null:Sequence.prototype;IndexedSequence.prototype=Object.create(____SuperProtoOfSequence);IndexedSequence.prototype.constructor=IndexedSequence;IndexedSequence.__superConstructor__=Sequence;function IndexedSequence(){"use strict";if(Sequence!==null){Sequence.apply(this,arguments);}}

  IndexedSequence.prototype.toString=function() {"use strict";
    return this.__toString('Seq [', ']');
  };

  IndexedSequence.prototype.toArray=function() {"use strict";
    assertNotInfinite(this.length);
    var array = new Array(this.length || 0);
    array.length = this.forEach(function(v, i)  { array[i] = v; });
    return array;
  };

  IndexedSequence.prototype.fromEntries=function() {"use strict";
    var sequence = this;
    var fromEntriesSequence = sequence.__makeSequence();
    fromEntriesSequence.length = sequence.length;
    fromEntriesSequence.entries = function()  {return sequence;};
    fromEntriesSequence.__iterateUncached = function(fn, reverse, flipIndices) 
      {return sequence.__iterate(function(entry, _, c)  {return fn(entry[1], entry[0], c);}, reverse, flipIndices);};
    return fromEntriesSequence;
  };

  IndexedSequence.prototype.join=function(separator) {"use strict";
    separator = separator || ',';
    var string = '';
    var prevIndex = 0;
    this.forEach(function(v, i)  {
      var numSeparators = i - prevIndex;
      prevIndex = i;
      string += (numSeparators === 1 ? separator : repeatString(separator, numSeparators)) + v;
    });
    if (this.length && prevIndex < this.length - 1) {
      string += repeatString(separator, this.length - 1 - prevIndex);
    }
    return string;
  };

  IndexedSequence.prototype.concat=function() {"use strict";var values=Array.prototype.slice.call(arguments,0);
    var sequences = [this].concat(values).map(function(value)  {return Sequence(value);});
    var concatSequence = this.__makeSequence();
    concatSequence.length = sequences.reduce(
      function(sum, seq)  {return sum != null && seq.length != null ? sum + seq.length : undefined;}, 0
    );
    concatSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (flipIndices && !this.length) {
        // In order to reverse indices, first we must create a cached
        // representation. This ensures we will have the correct total length
        // so index reversal works as expected.
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      var stoppedIteration;
      var maxIndex = flipIndices && this.length - 1;
      var maxSequencesIndex = sequences.length - 1;
      for (var ii = 0; ii <= maxSequencesIndex && !stoppedIteration; ii++) {
        var sequence = sequences[reverse ? maxSequencesIndex - ii : ii];
        if (!(sequence instanceof IndexedSequence)) {
          sequence = sequence.values();
        }
        iterations += sequence.__iterate(function(v, index, c)  {
          index += iterations;
          if (fn(v, flipIndices ? maxIndex - index : index, c) === false) {
            stoppedIteration = true;
            return false;
          }
        }, reverse); // intentionally do not pass flipIndices
      }
      return iterations;
    }
    return concatSequence;
  };

  IndexedSequence.prototype.reverse=function(maintainIndices) {"use strict";
    var sequence = this;
    var reversedSequence = sequence.__makeSequence();
    reversedSequence.length = sequence.length;
    reversedSequence.__reversedIndices = !!(maintainIndices ^ sequence.__reversedIndices);
    reversedSequence.__iterateUncached = function(fn, reverse, flipIndices) 
      {return sequence.__iterate(fn, !reverse, flipIndices ^ maintainIndices);};
    reversedSequence.reverse = function ($IndexedSequence_maintainIndices) {
      return maintainIndices === $IndexedSequence_maintainIndices ? sequence :
        IndexedSequence.prototype.reverse.call(this, $IndexedSequence_maintainIndices);
    }
    return reversedSequence;
  };

  // Overridden to supply undefined length because it's entirely
  // possible this is sparse.
  IndexedSequence.prototype.values=function() {"use strict";
    var valuesSequence = ____SuperProtoOfSequence.values.call(this);
    valuesSequence.length = undefined;
    return valuesSequence;
  };

  IndexedSequence.prototype.filter=function(predicate, thisArg, maintainIndices) {"use strict";
    var filterSequence = filterFactory(this, predicate, thisArg, maintainIndices, maintainIndices);
    if (maintainIndices) {
      filterSequence.length = this.length;
    }
    return filterSequence;
  };

  IndexedSequence.prototype.indexOf=function(searchValue) {"use strict";
    return this.findIndex(function(value)  {return Immutable.is(value, searchValue);});
  };

  IndexedSequence.prototype.lastIndexOf=function(searchValue) {"use strict";
    return this.reverse(true).indexOf(searchValue);
  };

  IndexedSequence.prototype.findIndex=function(predicate, thisArg) {"use strict";
    var key = this.findKey(predicate, thisArg);
    return key == null ? -1 : key;
  };

  IndexedSequence.prototype.findLastIndex=function(predicate, thisArg) {"use strict";
    return this.reverse(true).findIndex(predicate, thisArg);
  };

  IndexedSequence.prototype.slice=function(begin, end, maintainIndices) {"use strict";
    var sequence = this;
    if (wholeSlice(begin, end, sequence.length)) {
      return sequence;
    }
    var sliceSequence = sequence.__makeSequence();
    var resolvedBegin = resolveBegin(begin, sequence.length);
    var resolvedEnd = resolveEnd(end, sequence.length);
    sliceSequence.length = sequence.length && (maintainIndices ? sequence.length : resolvedEnd - resolvedBegin);
    sliceSequence.__reversedIndices = sequence.__reversedIndices;
    sliceSequence.__iterateUncached = function(fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: reverse should be possible here.
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var reversedIndices = this.__reversedIndices ^ flipIndices;
      if (resolvedBegin !== resolvedBegin ||
          resolvedEnd !== resolvedEnd ||
          (reversedIndices && sequence.length == null)) {
        sequence.cacheResult();
        resolvedBegin = resolveBegin(begin, sequence.length);
        resolvedEnd = resolveEnd(end, sequence.length);
      }
      var iiBegin = reversedIndices ? sequence.length - resolvedEnd : resolvedBegin;
      var iiEnd = reversedIndices ? sequence.length - resolvedBegin : resolvedEnd;
      var length = sequence.__iterate(function(v, ii, c) 
        {return !(ii >= iiBegin && (iiEnd == null || ii < iiEnd)) || fn(v, maintainIndices ? ii : ii - iiBegin, c) !== false;},
        reverse, flipIndices
      );
      return this.length || (maintainIndices ? length : Math.max(0, length - iiBegin));
    };
    return sliceSequence;
  };

  IndexedSequence.prototype.splice=function(index, removeNum)  {"use strict";var values=Array.prototype.slice.call(arguments,2);
    if (removeNum === 0 && values.length === 0) {
      return this;
    }
    return this.slice(0, index).concat(values, this.slice(index + removeNum));
  };

  // Overrides to get length correct.
  IndexedSequence.prototype.takeWhile=function(predicate, thisArg, maintainIndices) {"use strict";
    var sequence = this;
    var takeSequence = sequence.__makeSequence();
    takeSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices);
      }
      var iterations = 0;
      // TODO: ensure didFinish is necessary here
      var didFinish = true;
      var length = sequence.__iterate(function(v, ii, c)  {
        if (predicate.call(thisArg, v, ii, c) && fn(v, ii, c) !== false) {
          iterations = ii;
        } else {
          didFinish = false;
          return false;
        }
      }, reverse, flipIndices);
      return maintainIndices ? takeSequence.length : didFinish ? length : iterations + 1;
    };
    if (maintainIndices) {
      takeSequence.length = this.length;
    }
    return takeSequence;
  };

  IndexedSequence.prototype.skipWhile=function(predicate, thisArg, maintainIndices) {"use strict";
    var sequence = this;
    var skipWhileSequence = sequence.__makeSequence();
    if (maintainIndices) {
      skipWhileSequence.length = this.length;
    }
    skipWhileSequence.__iterateUncached = function (fn, reverse, flipIndices) {
      if (reverse) {
        // TODO: can we do a better job of this?
        return this.cacheResult().__iterate(fn, reverse, flipIndices)
      }
      var reversedIndices = sequence.__reversedIndices ^ flipIndices;
      var isSkipping = true;
      var indexOffset = 0;
      var length = sequence.__iterate(function(v, ii, c)  {
        if (isSkipping) {
          isSkipping = predicate.call(thisArg, v, ii, c);
          if (!isSkipping) {
            indexOffset = ii;
          }
        }
        return isSkipping || fn(v, flipIndices || maintainIndices ? ii : ii - indexOffset, c) !== false;
      }, reverse, flipIndices);
      return maintainIndices ? length : reversedIndices ? indexOffset + 1 : length - indexOffset;
    };
    return skipWhileSequence;
  };

  IndexedSequence.prototype.groupBy=function(mapper, context, maintainIndices) {"use strict";
    var seq = this;
    var groups = require('./OrderedMap').empty().withMutations(function(map)  {
      seq.forEach(function(value, index, collection)  {
        var groupKey = mapper(value, index, collection);
        var group = map.get(groupKey, __SENTINEL);
        if (group === __SENTINEL) {
          group = new Array(maintainIndices ? seq.length : 0);
          map.set(groupKey, group);
        }
        maintainIndices ? (group[index] = value) : group.push(value);
      });
    });
    return groups.map(function(group)  {return Sequence(group);});
  };

  // abstract __iterateUncached(fn, reverse, flipIndices)

  IndexedSequence.prototype.__makeSequence=function() {"use strict";
    return makeIndexedSequence(this);
  };


IndexedSequence.prototype.__toJS = IndexedSequence.prototype.toArray;
IndexedSequence.prototype.__toStringMapper = quoteString;


for(Sequence____Key in Sequence){if(Sequence.hasOwnProperty(Sequence____Key)){ObjectSequence[Sequence____Key]=Sequence[Sequence____Key];}}ObjectSequence.prototype=Object.create(____SuperProtoOfSequence);ObjectSequence.prototype.constructor=ObjectSequence;ObjectSequence.__superConstructor__=Sequence;
  function ObjectSequence(object) {"use strict";
    var keys = Object.keys(object);
    this.$ObjectSequence_object = object;
    this.$ObjectSequence_keys = keys;
    this.length = keys.length;
  }

  ObjectSequence.prototype.toObject=function() {"use strict";
    return this.$ObjectSequence_object;
  };

  ObjectSequence.prototype.get=function(key, undefinedValue) {"use strict";
    if (undefinedValue !== undefined && !this.has(key)) {
      return undefinedValue;
    }
    return this.$ObjectSequence_object[key];
  };

  ObjectSequence.prototype.has=function(key) {"use strict";
    return this.$ObjectSequence_object.hasOwnProperty(key);
  };

  ObjectSequence.prototype.__iterate=function(fn, reverse) {"use strict";
    var object = this.$ObjectSequence_object;
    var keys = this.$ObjectSequence_keys;
    var maxIndex = keys.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      var iteration = reverse ? maxIndex - ii : ii;
      if (fn(object[keys[iteration]], keys[iteration], object) === false) {
        break;
      }
    }
    return ii;
  };



for(var IndexedSequence____Key in IndexedSequence){if(IndexedSequence.hasOwnProperty(IndexedSequence____Key)){ArraySequence[IndexedSequence____Key]=IndexedSequence[IndexedSequence____Key];}}var ____SuperProtoOfIndexedSequence=IndexedSequence===null?null:IndexedSequence.prototype;ArraySequence.prototype=Object.create(____SuperProtoOfIndexedSequence);ArraySequence.prototype.constructor=ArraySequence;ArraySequence.__superConstructor__=IndexedSequence;
  function ArraySequence(array) {"use strict";
    this.$ArraySequence_array = array;
    this.length = array.length;
  }

  ArraySequence.prototype.toArray=function() {"use strict";
    return this.$ArraySequence_array;
  };

  ArraySequence.prototype.__iterate=function(fn, reverse, flipIndices) {"use strict";
    var array = this.$ArraySequence_array;
    var maxIndex = array.length - 1;
    var lastIndex = -1;
    if (reverse) {
      for (var ii = maxIndex; ii >= 0; ii--) {
        if (array.hasOwnProperty(ii) &&
            fn(array[ii], flipIndices ? ii : maxIndex - ii, array) === false) {
          return lastIndex + 1;
        }
        lastIndex = ii;
      }
      return array.length;
    } else {
      var didFinish = array.every(function(value, index)  {
        if (fn(value, flipIndices ? maxIndex - index : index, array) === false) {
          return false;
        } else {
          lastIndex = index;
          return true;
        }
      });
      return didFinish ? array.length : lastIndex + 1;
    }
  };


ArraySequence.prototype.get = ObjectSequence.prototype.get;
ArraySequence.prototype.has = ObjectSequence.prototype.has;


function makeSequence() {
  return Object.create(Sequence.prototype);
}

function makeIndexedSequence(parent) {
  var newSequence = Object.create(IndexedSequence.prototype);
  newSequence.__reversedIndices = parent ? parent.__reversedIndices : false;
  return newSequence;
}

function getInDeepSequence(seq, keyPath, notFoundValue, pathOffset) {
  var nested = seq.get ? seq.get(keyPath[pathOffset], __SENTINEL) : __SENTINEL;
  if (nested === __SENTINEL) {
    return notFoundValue;
  }
  if (pathOffset === keyPath.length - 1) {
    return nested;
  }
  return getInDeepSequence(nested, keyPath, notFoundValue, pathOffset + 1);
}

function wholeSlice(begin, end, length) {
  return (begin === 0 || (length != null && begin <= -length)) &&
    (end == null || (length != null && end >= length));
}

function resolveBegin(begin, length) {
  return begin < 0 ? Math.max(0, length + begin) : length ? Math.min(length, begin) : begin;
}

function resolveEnd(end, length) {
  return end == null ? length : end < 0 ? Math.max(0, length + end) : length ? Math.min(length, end) : end;
}

function entryMapper(v, k) {
  return [k, v];
}

function returnTrue() {
  return true;
}

function returnThis() {
  return this;
}

/**
 * Sequence.prototype.filter and IndexedSequence.prototype.filter are so close
 * in behavior that it makes sense to build a factory with the few differences
 * encoded as booleans.
 */
function filterFactory(sequence, predicate, thisArg, useKeys, maintainIndices) {
  var filterSequence = sequence.__makeSequence();
  filterSequence.__iterateUncached = function(fn, reverse, flipIndices)  {
    var iterations = 0;
    var length = sequence.__iterate(function(v, k, c)  {
      if (predicate.call(thisArg, v, k, c)) {
        if (fn(v, useKeys ? k : iterations, c) !== false) {
          iterations++;
        } else {
          return false;
        }
      }
    }, reverse, flipIndices);
    return maintainIndices ? length : iterations;
  };
  return filterSequence;
}

function not(predicate) {
  return function() {
    return !predicate.apply(this, arguments);
  }
}

function quoteString(value) {
  return typeof value === 'string' ? JSON.stringify(value) : value;
}

function repeatString(string, times) {
  var repeated = '';
  while (times) {
    if (times & 1) {
      repeated += string;
    }
    if ((times >>= 1)) {
      string += string;
    }
  }
  return repeated;
}

function assertNotInfinite(length) {
  if (length === Infinity) {
    throw new Error('Cannot perform this action with an infinite sequence.');
  }
}

var __SENTINEL = {};

exports.Sequence = Sequence;
exports.IndexedSequence = IndexedSequence;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Sequence.js","/..\\node_modules\\immutable\\dist")
},{"./Immutable":5,"./Map":6,"./OrderedMap":7,"./Set":12,"./Vector":13,"VCmEsw":4,"buffer":1}],12:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var SequenceModule = require('./Sequence');
var ImmutableMap = require('./Map');
var Sequence = SequenceModule.Sequence;
var IndexedSequence = SequenceModule.IndexedSequence;


for(var Sequence____Key in Sequence){if(Sequence.hasOwnProperty(Sequence____Key)){Set[Sequence____Key]=Sequence[Sequence____Key];}}var ____SuperProtoOfSequence=Sequence===null?null:Sequence.prototype;Set.prototype=Object.create(____SuperProtoOfSequence);Set.prototype.constructor=Set;Set.__superConstructor__=Sequence;

  // @pragma Construction

  function Set() {"use strict";var values=Array.prototype.slice.call(arguments,0);
    return Set.from(values);
  }

  Set.empty=function() {"use strict";
    return __EMPTY_SET || (__EMPTY_SET = Set.$Set_make());
  };

  Set.from=function(sequence) {"use strict";
    if (sequence && sequence.constructor === Set) {
      return sequence;
    }
    if (!sequence || sequence.length === 0) {
      return Set.empty();
    }
    return Set.empty().union(sequence);
  };

  Set.fromKeys=function(sequence) {"use strict";
    return Set.from(Sequence(sequence).flip());
  };

  Set.prototype.toString=function() {"use strict";
    return this.__toString('Set {', '}');
  };

  // @pragma Access

  Set.prototype.has=function(value) {"use strict";
    return this.$Set_map ? this.$Set_map.has(value) : false;
  };

  Set.prototype.get=function(value, notFoundValue) {"use strict";
    return this.has(value) ? value : notFoundValue;
  };

  // @pragma Modification

  Set.prototype.add=function(value) {"use strict";
    if (value == null) {
      return this;
    }
    var newMap = this.$Set_map;
    if (!newMap) {
      newMap = ImmutableMap.empty().__ensureOwner(this.__ownerID);
    }
    newMap = newMap.set(value, null);
    if (this.__ownerID) {
      this.length = newMap.length;
      this.$Set_map = newMap;
      return this;
    }
    return newMap === this.$Set_map ? this : Set.$Set_make(newMap);
  };

  Set.prototype.delete=function(value) {"use strict";
    if (value == null || this.$Set_map == null) {
      return this;
    }
    var newMap = this.$Set_map.delete(value);
    if (newMap.length === 0) {
      return this.clear();
    }
    if (this.__ownerID) {
      this.length = newMap.length;
      this.$Set_map = newMap;
      return this;
    }
    return newMap === this.$Set_map ? this : Set.$Set_make(newMap);
  };

  Set.prototype.clear=function() {"use strict";
    if (this.__ownerID) {
      this.length = 0;
      this.$Set_map = null;
      return this;
    }
    return Set.empty();
  };

  // @pragma Composition

  Set.prototype.union=function() {"use strict";
    var seqs = arguments;
    if (seqs.length === 0) {
      return this;
    }
    return this.withMutations(function(set)  {
      for (var ii = 0; ii < seqs.length; ii++) {
        var seq = seqs[ii];
        seq = seq.forEach ? seq : Sequence(seq);
        seq.forEach(function(value)  {return set.add(value);});
      }
    });
  };

  Set.prototype.intersect=function() {"use strict";var seqs=Array.prototype.slice.call(arguments,0);
    if (seqs.length === 0) {
      return this;
    }
    seqs = seqs.map(function(seq)  {return Sequence(seq);});
    var originalSet = this;
    return this.withMutations(function(set)  {
      originalSet.forEach(function(value)  {
        if (!seqs.every(function(seq)  {return seq.contains(value);})) {
          set.delete(value);
        }
      });
    });
  };

  Set.prototype.subtract=function() {"use strict";var seqs=Array.prototype.slice.call(arguments,0);
    if (seqs.length === 0) {
      return this;
    }
    seqs = seqs.map(function(seq)  {return Sequence(seq);});
    var originalSet = this;
    return this.withMutations(function(set)  {
      originalSet.forEach(function(value)  {
        if (seqs.some(function(seq)  {return seq.contains(value);})) {
          set.delete(value);
        }
      });
    });
  };

  Set.prototype.isSubset=function(seq) {"use strict";
    seq = Sequence(seq);
    return this.every(function(value)  {return seq.contains(value);});
  };

  Set.prototype.isSuperset=function(seq) {"use strict";
    var set = this;
    seq = Sequence(seq);
    return seq.every(function(value)  {return set.contains(value);});
  };

  // @pragma Mutability

  Set.prototype.__ensureOwner=function(ownerID) {"use strict";
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this.$Set_map && this.$Set_map.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this.$Set_map = newMap;
      return this;
    }
    return Set.$Set_make(newMap, ownerID);
  };

  // @pragma Iteration

  Set.prototype.__deepEquals=function(other) {"use strict";
    return !(this.$Set_map || other.$Set_map) || this.$Set_map.equals(other.$Set_map);
  };

  Set.prototype.__iterate=function(fn, reverse) {"use strict";
    var collection = this;
    return this.$Set_map ? this.$Set_map.__iterate(function(_, k)  {return fn(k, k, collection);}, reverse) : 0;
  };

  // @pragma Private

  Set.$Set_make=function(map, ownerID) {"use strict";
    var set = Object.create(Set.prototype);
    set.length = map ? map.length : 0;
    set.$Set_map = map;
    set.__ownerID = ownerID;
    return set;
  };


Set.prototype.contains = Set.prototype.has;
Set.prototype.withMutations = ImmutableMap.prototype.withMutations;
Set.prototype.asMutable = ImmutableMap.prototype.asMutable;
Set.prototype.asImmutable = ImmutableMap.prototype.asImmutable;
Set.prototype.__toJS = IndexedSequence.prototype.__toJS;
Set.prototype.__toStringMapper = IndexedSequence.prototype.__toStringMapper;


var __EMPTY_SET;

module.exports = Set;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Set.js","/..\\node_modules\\immutable\\dist")
},{"./Map":6,"./Sequence":11,"VCmEsw":4,"buffer":1}],13:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var SequenceModule = require('./Sequence');
var Sequence = SequenceModule.Sequence;
var IndexedSequence = SequenceModule.IndexedSequence;
var ImmutableMap = require('./Map');


for(var IndexedSequence____Key in IndexedSequence){if(IndexedSequence.hasOwnProperty(IndexedSequence____Key)){Vector[IndexedSequence____Key]=IndexedSequence[IndexedSequence____Key];}}var ____SuperProtoOfIndexedSequence=IndexedSequence===null?null:IndexedSequence.prototype;Vector.prototype=Object.create(____SuperProtoOfIndexedSequence);Vector.prototype.constructor=Vector;Vector.__superConstructor__=IndexedSequence;

  // @pragma Construction

  function Vector() {"use strict";var values=Array.prototype.slice.call(arguments,0);
    return Vector.from(values);
  }

  Vector.empty=function() {"use strict";
    return __EMPTY_VECT || (__EMPTY_VECT =
      Vector.$Vector_make(0, 0, SHIFT, __EMPTY_VNODE, __EMPTY_VNODE)
    );
  };

  Vector.from=function(sequence) {"use strict";
    if (sequence && sequence.constructor === Vector) {
      return sequence;
    }
    if (!sequence || sequence.length === 0) {
      return Vector.empty();
    }
    var isArray = Array.isArray(sequence);
    if (sequence.length > 0 && sequence.length < SIZE) {
      return Vector.$Vector_make(0, sequence.length, SHIFT, __EMPTY_VNODE, new VNode(
        isArray ? sequence.slice() : Sequence(sequence).toArray()
      ));
    }
    if (!isArray) {
      sequence = Sequence(sequence);
      if (!(sequence instanceof IndexedSequence)) {
        sequence = sequence.values();
      }
    }
    return Vector.empty().merge(sequence);
  };

  Vector.prototype.toString=function() {"use strict";
    return this.__toString('Vector [', ']');
  };

  // @pragma Access

  Vector.prototype.get=function(index, undefinedValue) {"use strict";
    index = rawIndex(index, this.$Vector_origin);
    if (index >= this.$Vector_size) {
      return undefinedValue;
    }
    var node = this.$Vector_nodeFor(index);
    var maskedIndex = index & MASK;
    return node && (undefinedValue === undefined || node.array.hasOwnProperty(maskedIndex)) ?
      node.array[maskedIndex] : undefinedValue;
  };

  Vector.prototype.first=function() {"use strict";
    return this.get(0);
  };

  Vector.prototype.last=function() {"use strict";
    return this.get(this.length ? this.length - 1 : 0);
  };

  // @pragma Modification

  // TODO: set and delete seem very similar.

  Vector.prototype.set=function(index, value) {"use strict";
    var tailOffset = getTailOffset(this.$Vector_size);

    if (index >= this.length) {
      return this.withMutations(function(vect) 
        {return vect.$Vector_setBounds(0, index + 1).set(index, value);}
      );
    }

    if (this.get(index, __SENTINEL) === value) {
      return this;
    }

    index = rawIndex(index, this.$Vector_origin);

    // Fits within tail.
    if (index >= tailOffset) {
      var newTail = this.$Vector_tail.ensureOwner(this.__ownerID);
      newTail.array[index & MASK] = value;
      var newSize = index >= this.$Vector_size ? index + 1 : this.$Vector_size;
      if (this.__ownerID) {
        this.length = newSize - this.$Vector_origin;
        this.$Vector_size = newSize;
        this.$Vector_tail = newTail;
        return this;
      }
      return Vector.$Vector_make(this.$Vector_origin, newSize, this.$Vector_level, this.$Vector_root, newTail);
    }

    // Fits within existing tree.
    var newRoot = this.$Vector_root.ensureOwner(this.__ownerID);
    var node = newRoot;
    for (var level = this.$Vector_level; level > 0; level -= SHIFT) {
      var idx = (index >>> level) & MASK;
      node = node.array[idx] = node.array[idx] ? node.array[idx].ensureOwner(this.__ownerID) : new VNode([], this.__ownerID);
    }
    node.array[index & MASK] = value;
    if (this.__ownerID) {
      this.$Vector_root = newRoot;
      return this;
    }
    return Vector.$Vector_make(this.$Vector_origin, this.$Vector_size, this.$Vector_level, newRoot, this.$Vector_tail);
  };

  Vector.prototype.delete=function(index) {"use strict";
    // Out of bounds, no-op. Probably a more efficient way to do this...
    if (!this.has(index)) {
      return this;
    }

    var tailOffset = getTailOffset(this.$Vector_size);
    index = rawIndex(index, this.$Vector_origin);

    // Delete within tail.
    if (index >= tailOffset) {
      var newTail = this.$Vector_tail.ensureOwner(this.__ownerID);
      delete newTail.array[index & MASK];
      if (this.__ownerID) {
        this.$Vector_tail = newTail;
        return this;
      }
      return Vector.$Vector_make(this.$Vector_origin, this.$Vector_size, this.$Vector_level, this.$Vector_root, newTail);
    }

    // Fits within existing tree.
    var newRoot = this.$Vector_root.ensureOwner(this.__ownerID);
    var node = newRoot;
    for (var level = this.$Vector_level; level > 0; level -= SHIFT) {
      var idx = (index >>> level) & MASK;
      // TODO: if we don't check "has" above, this could be null.
      node = node.array[idx] = node.array[idx].ensureOwner(this.__ownerID);
    }
    delete node.array[index & MASK];
    if (this.__ownerID) {
      this.$Vector_root = newRoot;
      return this;
    }
    return Vector.$Vector_make(this.$Vector_origin, this.$Vector_size, this.$Vector_level, newRoot, this.$Vector_tail);
  };

  Vector.prototype.clear=function() {"use strict";
    if (this.__ownerID) {
      this.length = this.$Vector_origin = this.$Vector_size = 0;
      this.$Vector_level = SHIFT;
      this.$Vector_root = this.$Vector_tail = __EMPTY_VNODE;
      return this;
    }
    return Vector.empty();
  };

  Vector.prototype.push=function() {"use strict";
    var values = arguments;
    var oldLength = this.length;
    return this.withMutations(function(vect)  {
      vect.$Vector_setBounds(0, oldLength + values.length);
      for (var ii = 0; ii < values.length; ii++) {
        vect.set(oldLength + ii, values[ii]);
      }
    });
  };

  Vector.prototype.pop=function() {"use strict";
    return this.$Vector_setBounds(0, -1);
  };

  Vector.prototype.unshift=function() {"use strict";
    var values = arguments;
    return this.withMutations(function(vect)  {
      vect.$Vector_setBounds(-values.length);
      for (var ii = 0; ii < values.length; ii++) {
        vect.set(ii, values[ii]);
      }
    });
  };

  Vector.prototype.shift=function() {"use strict";
    return this.$Vector_setBounds(1);
  };

  // @pragma Composition

  Vector.prototype.merge=function() {"use strict";var seqs=Array.prototype.slice.call(arguments,0);
    return ImmutableMap.prototype.merge.apply(
      vectorWithLengthOfLongestSeq(this, seqs), arguments);
  };

  Vector.prototype.mergeWith=function(fn)  {"use strict";var seqs=Array.prototype.slice.call(arguments,1);
    return ImmutableMap.prototype.mergeWith.apply(
      vectorWithLengthOfLongestSeq(this, seqs), arguments);
  };

  Vector.prototype.mergeDeep=function() {"use strict";var seqs=Array.prototype.slice.call(arguments,0);
    return ImmutableMap.prototype.mergeDeep.apply(
      vectorWithLengthOfLongestSeq(this, seqs), arguments);
  };

  Vector.prototype.mergeDeepWith=function(fn)  {"use strict";var seqs=Array.prototype.slice.call(arguments,1);
    return ImmutableMap.prototype.mergeDeepWith.apply(
      vectorWithLengthOfLongestSeq(this, seqs), arguments);
  };

  Vector.prototype.setLength=function(length) {"use strict";
    return this.$Vector_setBounds(0, length);
  };

  Vector.prototype.$Vector_setBounds=function(begin, end) {"use strict";
    var owner = this.__ownerID || new OwnerID();
    var oldOrigin = this.$Vector_origin;
    var oldSize = this.$Vector_size;
    var newOrigin = oldOrigin + begin;
    var newSize = end == null ? oldSize : end < 0 ? oldSize + end : oldOrigin + end;
    if (newOrigin === oldOrigin && newSize === oldSize) {
      return this;
    }

    // If it's going to end after it starts, it's empty.
    if (newOrigin >= newSize) {
      return this.clear();
    }

    var newLevel = this.$Vector_level;
    var newRoot = this.$Vector_root;

    // New origin might require creating a higher root.
    var offsetShift = 0;
    while (newOrigin + offsetShift < 0) {
      // TODO: why only ever shifting over by 1?
      newRoot = new VNode(newRoot.array.length ? [,newRoot] : [], owner);
      offsetShift += 1 << newLevel;
      newLevel += SHIFT;
    }
    if (offsetShift) {
      newOrigin += offsetShift;
      oldOrigin += offsetShift;
      newSize += offsetShift;
      oldSize += offsetShift;
    }

    var oldTailOffset = getTailOffset(oldSize);
    var newTailOffset = getTailOffset(newSize);

    // New size might require creating a higher root.
    while (newTailOffset >= 1 << (newLevel + SHIFT)) {
      newRoot = new VNode(newRoot.array.length ? [newRoot] : [], owner);
      newLevel += SHIFT;
    }

    // Locate or create the new tail.
    var oldTail = this.$Vector_tail;
    var newTail = newTailOffset < oldTailOffset ?
      this.$Vector_nodeFor(newSize) :
      newTailOffset > oldTailOffset ? new VNode([], owner) : oldTail;

    // Merge Tail into tree.
    if (newTailOffset > oldTailOffset && newOrigin < oldSize && oldTail.array.length) {
      newRoot = newRoot.ensureOwner(owner);
      var node = newRoot;
      for (var level = newLevel; level > SHIFT; level -= SHIFT) {
        var idx = (oldTailOffset >>> level) & MASK;
        node = node.array[idx] = node.array[idx] ? node.array[idx].ensureOwner(owner) : new VNode([], owner);
      }
      node.array[(oldTailOffset >>> SHIFT) & MASK] = oldTail;
    }

    // If the size has been reduced, there's a chance the tail needs to be trimmed.
    if (newSize < oldSize) {
      newTail = newTail.removeAfter(owner, 0, newSize);
    }

    // If the new origin is within the tail, then we do not need a root.
    if (newOrigin >= newTailOffset) {
      newOrigin -= newTailOffset;
      newSize -= newTailOffset;
      newLevel = SHIFT;
      newRoot = __EMPTY_VNODE;
      newTail = newTail.removeBefore(owner, 0, newOrigin);

    // Otherwise, if the root has been trimmed, garbage collect.
    } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
      var beginIndex, endIndex;
      offsetShift = 0;

      // Identify the new top root node of the subtree of the old root.
      do {
        beginIndex = ((newOrigin) >>> newLevel) & MASK;
        endIndex = ((newTailOffset - 1) >>> newLevel) & MASK;
        if (beginIndex === endIndex) {
          if (beginIndex) {
            offsetShift += (1 << newLevel) * beginIndex;
          }
          newLevel -= SHIFT;
          newRoot = newRoot && newRoot.array[beginIndex];
        }
      } while (newRoot && beginIndex === endIndex);

      // Trim the new sides of the new root.
      if (newRoot && newOrigin > oldOrigin) {
        newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
      }
      if (newRoot && newTailOffset < oldTailOffset) {
        newRoot = newRoot.removeAfter(owner, newLevel, newTailOffset - offsetShift);
      }
      if (offsetShift) {
        newOrigin -= offsetShift;
        newSize -= offsetShift;
      }
      // Ensure root is not null.
      newRoot = newRoot || __EMPTY_VNODE;
    }

    if (this.__ownerID) {
      this.length = newSize - newOrigin;
      this.$Vector_origin = newOrigin;
      this.$Vector_size = newSize;
      this.$Vector_level = newLevel;
      this.$Vector_root = newRoot;
      this.$Vector_tail = newTail;
      return this;
    }
    return Vector.$Vector_make(newOrigin, newSize, newLevel, newRoot, newTail);
  };

  // @pragma Mutability

  Vector.prototype.__ensureOwner=function(ownerID) {"use strict";
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      this.__ownerID = ownerID;
      return this;
    }
    return Vector.$Vector_make(this.$Vector_origin, this.$Vector_size, this.$Vector_level, this.$Vector_root, this.$Vector_tail, ownerID);
  };

  // @pragma Iteration

  Vector.prototype.slice=function(begin, end, maintainIndices) {"use strict";
    var sliceSequence = ____SuperProtoOfIndexedSequence.slice.call(this,begin, end, maintainIndices);
    // Optimize the case of vector.slice(b, e).toVector()
    if (!maintainIndices && sliceSequence !== this) {
      var vector = this;
      var length = vector.length;
      sliceSequence.toVector = function()  {return vector.$Vector_setBounds(
        begin < 0 ? Math.max(0, length + begin) : length ? Math.min(length, begin) : begin,
        end == null ? length : end < 0 ? Math.max(0, length + end) : length ? Math.min(length, end) : end
      );};
    }
    return sliceSequence;
  };

  Vector.prototype.__deepEquals=function(other) {"use strict";
    var is = require('./Immutable').is;
    var iterator = this.__iterator__();
    return other.every(function(v, k)  {
      var entry = iterator.next();
      return k === entry[0] && is(v, entry[1]);
    });
  };

  Vector.prototype.__iterator__=function() {"use strict";
    return new VectorIterator(
      this, this.$Vector_origin, this.$Vector_size, this.$Vector_level, this.$Vector_root, this.$Vector_tail
    );
  };

  Vector.prototype.__iterate=function(fn, reverse, flipIndices) {"use strict";
    var vector = this;
    var lastIndex = 0;
    var maxIndex = vector.length - 1;
    flipIndices ^= reverse;
    var eachFn = function(value, ii)  {
      if (fn(value, flipIndices ? maxIndex - ii : ii, vector) === false) {
        return false;
      } else {
        lastIndex = ii;
        return true;
      }
    };
    var didComplete;
    var tailOffset = getTailOffset(this.$Vector_size);
    if (reverse) {
      didComplete =
        this.$Vector_tail.iterate(0, tailOffset - this.$Vector_origin, this.$Vector_size - this.$Vector_origin, eachFn, reverse) &&
        this.$Vector_root.iterate(this.$Vector_level, -this.$Vector_origin, tailOffset - this.$Vector_origin, eachFn, reverse);
    } else {
      didComplete =
        this.$Vector_root.iterate(this.$Vector_level, -this.$Vector_origin, tailOffset - this.$Vector_origin, eachFn, reverse) &&
        this.$Vector_tail.iterate(0, tailOffset - this.$Vector_origin, this.$Vector_size - this.$Vector_origin, eachFn, reverse);
    }
    return (didComplete ? maxIndex : reverse ? maxIndex - lastIndex : lastIndex) + 1;
  };

  // @pragma Private

  Vector.$Vector_make=function(origin, size, level, root, tail, ownerID) {"use strict";
    var vect = Object.create(Vector.prototype);
    vect.length = size - origin;
    vect.$Vector_origin = origin;
    vect.$Vector_size = size;
    vect.$Vector_level = level;
    vect.$Vector_root = root;
    vect.$Vector_tail = tail;
    vect.__ownerID = ownerID;
    return vect;
  };

  Vector.prototype.$Vector_nodeFor=function(rawIndex) {"use strict";
    if (rawIndex >= getTailOffset(this.$Vector_size)) {
      return this.$Vector_tail;
    }
    if (rawIndex < 1 << (this.$Vector_level + SHIFT)) {
      var node = this.$Vector_root;
      var level = this.$Vector_level;
      while (node && level > 0) {
        node = node.array[(rawIndex >>> level) & MASK];
        level -= SHIFT;
      }
      return node;
    }
  };


Vector.prototype.updateIn = ImmutableMap.prototype.updateIn;
Vector.prototype.withMutations = ImmutableMap.prototype.withMutations;
Vector.prototype.asMutable = ImmutableMap.prototype.asMutable;
Vector.prototype.asImmutable = ImmutableMap.prototype.asImmutable;



  function OwnerID() {"use strict";}




  function VNode(array, ownerID) {"use strict";
    this.array = array;
    this.ownerID = ownerID;
  }

  VNode.prototype.ensureOwner=function(ownerID) {"use strict";
    if (ownerID && ownerID === this.ownerID) {
      return this;
    }
    return new VNode(this.array.slice(), ownerID);
  };

  // TODO: seems like these methods are very similar

  VNode.prototype.removeBefore=function(ownerID, level, index) {"use strict";
    if (index === 1 << level || this.array.length === 0) {
      return this;
    }
    var originIndex = (index >>> level) & MASK;
    if (originIndex >= this.array.length) {
      return new VNode([], ownerID);
    }
    var removingFirst = originIndex === 0;
    var newChild;
    if (level > 0) {
      var oldChild = this.array[originIndex];
      newChild = oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
      if (newChild === oldChild && removingFirst) {
        return this;
      }
    }
    if (removingFirst && !newChild) {
      return this;
    }
    var editable = this.ensureOwner();
    if (!removingFirst) {
      for (var ii = 0; ii < originIndex; ii++) {
        delete editable.array[ii];
      }
    }
    if (newChild) {
      editable.array[originIndex] = newChild;
    }
    return editable;
  };

  VNode.prototype.removeAfter=function(ownerID, level, index) {"use strict";
    if (index === 1 << level || this.array.length === 0) {
      return this;
    }
    var sizeIndex = ((index - 1) >>> level) & MASK;
    if (sizeIndex >= this.array.length) {
      return this;
    }
    var removingLast = sizeIndex === this.array.length - 1;
    var newChild;
    if (level > 0) {
      var oldChild = this.array[sizeIndex];
      newChild = oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
      if (newChild === oldChild && removingLast) {
        return this;
      }
    }
    if (removingLast && !newChild) {
      return this;
    }
    var editable = this.ensureOwner();
    if (!removingLast) {
      editable.array.length = sizeIndex + 1;
    }
    if (newChild) {
      editable.array[sizeIndex] = newChild;
    }
    return editable;
  };

  VNode.prototype.iterate=function(level, offset, max, fn, reverse) {"use strict";
    // Note using every() gets us a speed-up of 2x on modern JS VMs, but means
    // we cannot support IE8 without polyfill.
    if (level === 0) {
      if (reverse) {
        for (var revRawIndex = this.array.length - 1; revRawIndex >= 0; revRawIndex--) {
          if (this.array.hasOwnProperty(revRawIndex)) {
            var index = revRawIndex + offset;
            if (index >= 0 && index < max && fn(this.array[revRawIndex], index) === false) {
              return false;
            }
          }
        }
        return true;
      } else {
        return this.array.every(function(value, rawIndex)  {
          var index = rawIndex + offset;
          return index < 0 || index >= max || fn(value, index) !== false;
        });
      }
    }
    var step = 1 << level;
    var newLevel = level - SHIFT;
    if (reverse) {
      for (var revLevelIndex = this.array.length - 1; revLevelIndex >= 0; revLevelIndex--) {
        var newOffset = offset + revLevelIndex * step;
        if (newOffset < max && newOffset + step > 0 &&
            this.array.hasOwnProperty(revLevelIndex) &&
            !this.array[revLevelIndex].iterate(newLevel, newOffset, max, fn, reverse)) {
          return false;
        }
      }
      return true;
    } else {
      return this.array.every(function(newNode, levelIndex)  {
        var newOffset = offset + levelIndex * step;
        return newOffset >= max || newOffset + step <= 0 || newNode.iterate(newLevel, newOffset, max, fn, reverse);
      });
    }
  };





  function VectorIterator(vector, origin, size, level, root, tail) {"use strict";
    var tailOffset = getTailOffset(size);
    this.$VectorIterator_stack = {
      node: root.array,
      level: level,
      offset: -origin,
      max: tailOffset - origin,
      __prev: {
        node: tail.array,
        level: 0,
        offset: tailOffset - origin,
        max: size - origin
      }
    };
  }

  VectorIterator.prototype.next=function()  {"use strict";
    var stack = this.$VectorIterator_stack;
    iteration: while (stack) {
      if (stack.level === 0) {
        stack.rawIndex || (stack.rawIndex = 0);
        while (stack.rawIndex < stack.node.length) {
          var index = stack.rawIndex + stack.offset;
          if (index >= 0 && index < stack.max && stack.node.hasOwnProperty(stack.rawIndex)) {
            var value = stack.node[stack.rawIndex];
            stack.rawIndex++;
            return [index, value];
          } else {
            stack.rawIndex++;
          }
        }
      } else {
        var step = 1 << stack.level;
        stack.levelIndex || (stack.levelIndex = 0);
        while (stack.levelIndex < stack.node.length) {
          var newOffset = stack.offset + stack.levelIndex * step;
          if (newOffset + step > 0 && newOffset < stack.max && stack.node.hasOwnProperty(stack.levelIndex)) {
            var newNode = stack.node[stack.levelIndex].array;
            stack.levelIndex++;
            stack = this.$VectorIterator_stack = {
              node: newNode,
              level: stack.level - SHIFT,
              offset: newOffset,
              max: stack.max,
              __prev: stack
            };
            continue iteration;
          } else {
            stack.levelIndex++;
          }
        }
      }
      stack = this.$VectorIterator_stack = this.$VectorIterator_stack.__prev;
    }
    if (global.StopIteration) {
      throw global.StopIteration;
    }
  };



function vectorWithLengthOfLongestSeq(vector, seqs) {
  var maxLength = Math.max.apply(null, seqs.map(function(seq)  {return seq.length || 0;}));
  return maxLength > vector.length ? vector.setLength(maxLength) : vector;
}

function rawIndex(index, origin) {
  if (index < 0) throw new Error('Index out of bounds');
  return index + origin;
}

function getTailOffset(size) {
  return size < SIZE ? 0 : (((size - 1) >>> SHIFT) << SHIFT);
}


var SHIFT = 5; // Resulted in best performance after ______?
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;
var __SENTINEL = {};
var __EMPTY_VECT;
var __EMPTY_VNODE = new VNode([]);

module.exports = Vector;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\immutable\\dist\\Vector.js","/..\\node_modules\\immutable\\dist")
},{"./Immutable":5,"./Map":6,"./Sequence":11,"VCmEsw":4,"buffer":1}],14:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = require('./multimethod');

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\multimethod\\index.js","/..\\node_modules\\multimethod")
},{"./multimethod":15,"VCmEsw":4,"buffer":1}],15:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
// multimethod.js 0.1.0
//
// (c) 2011 Kris Jordan
//
// `multimethod` is freely distributable under the MIT license.
// For details and documentation: 
// [http://krisjordan.com/multimethod-js](http://krisjordan.com/multimethod-js)

(function() {

    // Multimethods are a functional programming control structure for dispatching 
    // function calls with user-defined criteria that can be changed at run time.
    // Inspired by clojure's multimethods, multimethod.js provides an alternative to
    // classical, prototype-chain based polymorphism.

    // ## Internal Utility Functions

    // No operation function used by default by `default`.
    var noop = function() {};

    // Identity `dispatch` function. Default value of `dispatch`.
    var identity = function(a) { return a; };

    // A `method` in `multimethod` is a (match value, function) pair stored in
    // an array. `indexOf` takes a value and array of methods and returns the 
    // index of the method whose value is equal to the first argument. If no 
    // match is found, false is returned.
    var indexOf = function(value, methods) {
        for(var i in methods) {
            var matches  = methods[i][0];
            if(_(value).isEqual(matches)) {
                return i;
            }
        }
        return false;
    }

    // Given a dispatch `value` and array of `method`s, return the function 
    // of the `method` whose match value corresponds to a dispatch value.
    var match = function(value, methods) {
        var index = indexOf(value, methods);
        if(index !== false) {
            return methods[index][1];
        } else {
            return false;
        }
    }

    // Simple, consistent helper that returns a native value or invokes a function
    // and returns its return value. Used by `when` and `default` allowing
    // short-hand notation for returning values rather than calling functions.
    var toValue = function(subject, args) {
        if(_.isFunction(subject)) {
            return subject.apply(this, args);
        } else {
            return subject;
        }
    };

    // Plucking a single property value from an object in `dispatch` is commonly
    // used. The internal `pluck` function returns a function suitable for use
    // by `dispatch` for just that purpose.
    var pluck = function(property) {
        return function(object) {
            return object[property];
        }
    };


    // ## Implementation 

    // `multimethod` is a higher-order function that returns a closure with 
    // methods to control its behavior.
    var multimethod = function(dispatch) { 

        // ### Private Properties

            // `_dispatch` holds either a dispatch function or a string 
            // corresponding to the property name whose value will be plucked 
            // and used as the `dispatch` criteria.
        var _dispatch,
            // `_methods` is a an array of `method` arrays. A `method` is
            // [ matchValue, implementation ].
            _methods   = [],
            // `_default` is the fallback method when a `multimethod` is called
            // and matches no other method.
            _default   = noop;

        // The fundamental control flow of the `multimethod` is implemented
        // in `_lookup`. First we invoke the dispatch function, this gives
        // us our match criteria. Then we match a method based on the criteria
        // or return the default method.
        var _lookup    = function() {
            var criteria    = _dispatch.apply(this, arguments),
                method      = match(criteria, _methods);
            if(method !== false) {
                return method;
            } else {
                return _default;
            }
        };

        // The result of calling `multimethod`'s "factory" function is this function.
        var returnFn  = function() {
            var method = _lookup.apply(this, arguments);
            return toValue.call(this, method, arguments);
        };

        // ### Member Methods / API

        // `dispatch` is the accessor to the `multimethod`'s `_dispatch` function.
        // When called with a string we create an anonymous pluck function as a 
        // shorthand.
        returnFn['dispatch'] = function(dispatch) {
            if(_.isFunction(dispatch)) {
                _dispatch = dispatch;
            } else if(_.isString(dispatch)) {
                _dispatch = pluck(dispatch);
            } else {
                throw "dispatch requires a function or a string.";
            }
            return this;
        }
        // If `multimethod` is called/"constructed" with a `dispatch` value we go ahead and set
        // it up here. Otherwise `dispatch` is the `identity` function.
        returnFn.dispatch(dispatch || identity);

        // `when` introduces new `method`s to a `multimethod`. If the
        // `matchValue` has already been registered the new method will
        // overwrite the old method.
        returnFn['when'] = function(matchValue, fn) {
            var index = indexOf(matchValue, _methods);
            if(index !== false) {
                _methods[index] = [matchValue, fn];
            } else {
                _methods.push([matchValue, fn]);
            }
            return this;
        }

        // `remove` will unregister a `method` based on matchValue
        returnFn['remove'] = function(matchValue) {
            var index = indexOf(matchValue, _methods);
            if(index !== false) {
                _methods.splice(index, 1);
            }
            return this;
        }

        // `default` is an accessor to control the `_default`, fallback method
        // that is called when no match is found when the `multimethod` is 
        // invoked and dispatched.
        returnFn['default'] = function(method) {
            _default = method;
            return this;
        }

        // Our `multimethod` instance/closure is fully setup now, return!
        return returnFn;
    };

    // The following snippet courtesy of underscore.js.
    // Export `multimethod` to the window/exports namespace.
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = multimethod;
            var _ = require('underscore');
        }
        exports.multimethod = multimethod;
    } else if (typeof define === 'function' && define.amd) {
        define('multimethod', function() {
            return multimethod;
        });
    } else {
        this['multimethod'] = multimethod;
        var _ = this['_'];
    }

    multimethod.version = '0.1.0';

}).call(this);

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\multimethod\\multimethod.js","/..\\node_modules\\multimethod")
},{"VCmEsw":4,"buffer":1,"underscore":16}],16:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
//     Underscore.js 1.2.1
//     (c) 2011 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js** and **"CommonJS"**, with
  // backwards-compatibility for the old `require()` API. If we're not in
  // CommonJS, add `_` to the global object.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else if (typeof define === 'function' && define.amd) {
    // Register as a named module with AMD.
    define('underscore', function() {
      return _;
    });
  } else {
    // Exported as a string, for Closure Compiler "advanced" mode.
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.2.1';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = memo !== void 0;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError("Reduce of empty array with no initial value");
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return memo !== void 0 ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = (_.isArray(obj) ? obj.slice() : _.toArray(obj)).reverse();
    return _.reduce(reversed, iterator, memo, context);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator = iterator || _.identity;
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result |= iterator.call(context, value, index, list)) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      if (value === target) return true;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (method.call ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      if (index == 0) {
        shuffled[0] = value;
      } else {
        rand = Math.floor(Math.random() * (index + 1));
        shuffled[index] = shuffled[rand];
        shuffled[rand] = value;
      }
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(iterable) {
    if (!iterable)                return [];
    if (iterable.toArray)         return iterable.toArray();
    if (_.isArray(iterable))      return slice.call(iterable);
    if (_.isArguments(iterable))  return slice.call(iterable);
    return _.values(iterable);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.toArray(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head`. The **guard** check allows it to work
  // with `_.map`.
  _.first = _.head = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, array.length - n) : array[array.length - 1];
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var result = [];
    _.reduce(initial, function(memo, el, i) {
      if (0 == i || (isSorted === true ? _.last(memo) != el : !_.include(memo, el))) {
        memo[memo.length] = el;
        result[result.length] = array[i];
      }
      return memo;
    }, []);
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and another.
  // Only the elements present in just the first array will remain.
  _.difference = function(array, other) {
    return _.filter(array, function(value){ return !_.include(other, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return hasOwnProperty.call(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(func, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var timeout, context, args, throttling, finishThrottle;
    finishThrottle = _.debounce(function(){ throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var throttler = function() {
        timeout = null;
        func.apply(context, args);
        finishThrottle();
      };
      if (!timeout) timeout = setTimeout(throttler, wait);
      if (!throttling) func.apply(context, args);
      if (finishThrottle) finishThrottle();
      throttling = true;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds.
  _.debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var throttler = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(throttler, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = slice.call(arguments);
    return function() {
      var args = slice.call(arguments);
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (hasOwnProperty.call(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (source[prop] !== void 0) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if ((a == null) || (b == null)) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (_.isFunction(a.isEqual)) return a.isEqual(b);
    if (_.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare object types.
    var typeA = typeof a;
    if (typeA != typeof b) return false;
    // Optimization; ensure that both values are truthy or falsy.
    if (!a != !b) return false;
    // `NaN` values are equal.
    if (_.isNaN(a)) return _.isNaN(b);
    // Compare string objects by value.
    var isStringA = _.isString(a), isStringB = _.isString(b);
    if (isStringA || isStringB) return isStringA && isStringB && String(a) == String(b);
    // Compare number objects by value.
    var isNumberA = _.isNumber(a), isNumberB = _.isNumber(b);
    if (isNumberA || isNumberB) return isNumberA && isNumberB && +a == +b;
    // Compare boolean objects by value. The value of `true` is 1; the value of `false` is 0.
    var isBooleanA = _.isBoolean(a), isBooleanB = _.isBoolean(b);
    if (isBooleanA || isBooleanB) return isBooleanA && isBooleanB && +a == +b;
    // Compare dates by their millisecond values.
    var isDateA = _.isDate(a), isDateB = _.isDate(b);
    if (isDateA || isDateB) return isDateA && isDateB && a.getTime() == b.getTime();
    // Compare RegExps by their source patterns and flags.
    var isRegExpA = _.isRegExp(a), isRegExpB = _.isRegExp(b);
    if (isRegExpA || isRegExpB) {
      // Ensure commutative equality for RegExps.
      return isRegExpA && isRegExpB &&
             a.source == b.source &&
             a.global == b.global &&
             a.multiline == b.multiline &&
             a.ignoreCase == b.ignoreCase;
    }
    // Ensure that both values are objects.
    if (typeA != 'object') return false;
    // Arrays or Arraylikes with different lengths are not equal.
    if (a.length !== b.length) return false;
    // Objects with different constructors are not equal.
    if (a.constructor !== b.constructor) return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Deep compare objects.
    for (var key in a) {
      if (hasOwnProperty.call(a, key)) {
        // Count the expected number of properties.
        size++;
        // Deep compare each member.
        if (!(result = hasOwnProperty.call(b, key) && eq(a[key], b[key], stack))) break;
      }
    }
    // Ensure that both objects contain the same number of properties.
    if (result) {
      for (key in b) {
        if (hasOwnProperty.call(b, key) && !size--) break;
      }
      result = !size;
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (hasOwnProperty.call(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  if (toString.call(arguments) == '[object Arguments]') {
    _.isArguments = function(obj) {
      return toString.call(obj) == '[object Arguments]';
    };
  } else {
    _.isArguments = function(obj) {
      return !!(obj && hasOwnProperty.call(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&(?!\w+;|#\d+;|#x[\da-f]+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(str, data) {
    var c  = _.templateSettings;
    var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
      'with(obj||{}){__p.push(\'' +
      str.replace(/\\/g, '\\\\')
         .replace(/'/g, "\\'")
         .replace(c.escape, function(match, code) {
           return "',_.escape(" + code.replace(/\\'/g, "'") + "),'";
         })
         .replace(c.interpolate, function(match, code) {
           return "'," + code.replace(/\\'/g, "'") + ",'";
         })
         .replace(c.evaluate || null, function(match, code) {
           return "');" + code.replace(/\\'/g, "'")
                              .replace(/[\r\n\t]/g, ' ') + "__p.push('";
         })
         .replace(/\r/g, '\\r')
         .replace(/\n/g, '\\n')
         .replace(/\t/g, '\\t')
         + "');}return __p.join('');";
    var func = new Function('obj', tmpl);
    return data ? func(data) : func;
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      method.apply(this._wrapped, arguments);
      return result(this._wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

})();

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/..\\node_modules\\multimethod\\node_modules\\underscore\\underscore.js","/..\\node_modules\\multimethod\\node_modules\\underscore")
},{"VCmEsw":4,"buffer":1}],17:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var Immutable = require('immutable');
var u = require('./util');
var multimethod = require('multimethod');

var ElementNode = require('./logicNode').ElementNode;
var AttributeNode = require('./logicNode').AttributeNode;
var HtmlObjectAttributeNode = require('./logicNode').HtmlObjectAttributeNode;
var loopComposites = require('./logicNode')._loopComposites;

var obj = {};



var htmlElements = ['h1','h2','h3','h4','h5','h6','p','a','body','main','div','data','address','section','nav','article','aside','pre','hr','blockquote','ol','ul','li','dl','dt','dd','figure','figcaption','em','strong','small','s','cite','q','dfn','abbr','time','code','var','samp','kbd','sub','sup','i','b','u','mark','bdo','span','br','ins','del','img','iframe','embed','object','param','video','audio','source','track','canvas','map','area','svg','math','table','thead','th','tbody','tr','td','tfoot','colgroup','caption','col','form','fieldset','legend','label','input','button','select','datalist','optgroup','option','textarea','keygen','output','progress','meter','script','template','noscript','head','title','base','link','meta','style'];

var htmlAttributes = ['id','href','alt','rel','action','width','height','class','max','maxlength','min','readonly','autocomplete','disabled','name','rowspan','src','title'];

var htmlObjectAttributes = ['textContent', 'innerHTML'];

var obj = {
    filterData: function(accessor){
        var path = accessor.split('.');
        return function($parent, data){
            var dataCache = data;
            u.each(path, function(val){
                dataCache = dataCache[val];
            });
            return dataCache;
        };
    },

    each: function(){
        var args = arguments;
        return function($parent, data){
            console.log($parent, data, args);
            u.assertType(data, 'array');
            u.each(data, function(val){
                loopComposites($parent, args, val);
            });
            return data;
        };
    },
};

var generate = function(classObject, name){
    return function(){ return new classObject(name, arguments); };
};

u.each(htmlElements, function(val){
    obj[val] = generate(ElementNode, val);
});

u.each(htmlAttributes, function(val){
    obj[val] = generate(AttributeNode, val);
});

u.each(htmlObjectAttributes, function(val){
    obj[val] = generate(HtmlObjectAttributeNode, val);
});

var _elGenerator = function(elName){
    return function(){
        return new ElementNode(elName, arguments);
    };
};

var _setAttribute = function(attrName){
    return function(){
        return new AttributeNode(attrName);
    };
};

var _setObjectAttribute = function(attrName){
    return function(){
        return new AttributeNode(attrName);
    };
};



module.exports = obj;

//module.exports = {
//    div: function(){
//
//        var el = document.createElement('div');
//        var data;
//        var funcs = [];
//
//        for(var i = 0; i < arguments.length; i++){
//            var arg = arguments[i];
//            if(!u.isFunction(arg) && data === undefined){
//                data = arg;
//            }else{
//                funcs.push(arg);
//            }
//        }
//
//
//        return function(){
//            for(var i = 0; i < arguments.length; i++){
//                var arg = arguments[i];
//                if(arg instanceof Node){
//                    arg.appendChild(el);
//                }
//            }
//            for(var i = 0; i < funcs.length; i++){
//                funcs[i]()
//            }
//        };
//    }
//};

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/dom.js","/")
},{"./logicNode":18,"./util":21,"VCmEsw":4,"buffer":1,"immutable":5,"multimethod":14}],18:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var u = require('./util');

var loopComposites = function($el, args, data){
    u.each(args, function(val){
        if(u.isFunction(val.render)){
            data = val.render($el, data);
        }else if(u.isFunction(val)){
            data = val($el, data);
        }else if(u.isString(val) && args.text === undefined){
            $el.textContent = val;
        }
    });
    return data;
};

var baseInit = function(){
    return function(elName, args){
        if(elName !== undefined){
            this.elName = elName;
        }
        this.args = args;
        this.isRendered = false;
    };
};

var BaseNode = baseInit();

BaseNode.extend = function(extension){
    var newClass = baseInit();

    u.each(this, function(val, key){
        newClass[key] = val;
    });

    u.each(this.prototype, function(val, key){
        newClass.prototype[key] = val;
    });

    if(extension !== undefined){
        u.each(extension, function(val, key){
            newClass.prototype[key] = val;
        });
    }
    return newClass;
};

var ElementNode = BaseNode.extend({
    attach: function(){
        this.$el = document.createElement(this.elName);
        this.isRendered = true;
        this.$parent.appendChild(this.$el);
    },

    detach: function(){
        this.$el.remove();
        this.isRendered = false;
    },

    render: function($parent, data){
        if(this.isRendered === false){
            this.$parent = $parent;
            this.attach();
        }

        var oldData = data;
        loopComposites(this.$el, this.args, data);
        return oldData;
    }
});

var AttributeNode = BaseNode.extend({
    render: function($parent, data){
        var oldData = data;
        loopComposites($parent, this.args, data);
        return oldData;
    }
});


var HtmlObjectAttributeNode = BaseNode.extend({
    render: function($parent, data){
        var value = loopComposites($parent, this.args, data);
        $parent[this.elName] = value || data;
        return data;
    }
});

module.exports = {
    ElementNode: ElementNode,
    AttributeNode: AttributeNode,
    HtmlObjectAttributeNode: HtmlObjectAttributeNode,
    _loopComposites: loopComposites
};

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/logicNode.js","/")
},{"./util":21,"VCmEsw":4,"buffer":1}],19:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var dom = require('./selectors');
var $ = require('./dom');
var Immutable = require('immutable');

window.t = tasks;

var tasks = [
    {
        name: 'task 1',
        assignee: 'Julian',
        done: true
    },
    {
        name: 'task 2',
        assignee: 'Mike',
        done: false
    },
    {
        name: 'task 3',
        assignee: 'Andy',
        done: false
    }
];

var project = {
    title: { name: 'This is a list of tasks', link: 'http://google.com' },
    subTitle: 'By Julian',
    tasks: tasks
};


// There are two phases of creating a ui/template
// Number one is construction. We are using a set of
// functions to return a composite structure.
// Rendering can be initiated by simply executing the
// construct.
//


var list = $.ul(
    $.filterData('tasks'),
    $.each(
        $.li(
            $.h2($.filterData('name'), $.textContent()),
            $.h3($.filterData('assignee'), $.textContent()),
            $.strong($.filterData('done'), $.textContent())
        )
    )
);

var appConstruct = $.div(
    $.input($.id('taskName')),
    $.button($.id('addTask')),
    $.h1($.a(
        $.textContent($.filterData('title.name')),
        $.href($.filterData('title.link'))
    )),
    list
);

window.a = appConstruct;
appConstruct.render(dom.main, project);

window.i = Immutable;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/main.js","/")
},{"./dom":17,"./selectors":20,"VCmEsw":4,"buffer":1,"immutable":5}],20:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
var ids = document.querySelectorAll('[id]');
var u = require('./util');
var selectors = {};

u.each(ids, function(el){
    selectors[el.id] = el;
});

module.exports = selectors;

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/selectors.js","/")
},{"./util":21,"VCmEsw":4,"buffer":1}],21:[function(require,module,exports){
(function (process,global,Buffer,__argument0,__argument1,__argument2,__argument3,__filename,__dirname){
module.exports = {
    toType: function(obj) {
        return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    },

    error: function(mess){
        throw new Error(mess);
    },

    typeError: function(type){
        this.error('Invalid Argument Type, should be ' +  type);
    },

    assertType: function(obj, type){
        if(!this.isType(obj, type)){
            this.typeError(type);
        }
    },

    assertNotUndefined: function(obj){
        if(obj === undefined){
            this.error('Invalid Argument Type, cannot be undefined');
        }
    },

    isType: function(obj, string){
        return this.toType(obj) === string;
    },

    isFunction: function(arg){
        return this.toType(arg) === 'function';
    },

    isString: function(arg){
        return this.toType(arg) === 'string';
    },

    isNode: function(arg){
        return arg instanceof Node;
    },

    each: function(obj, func){
        this.assertType(func, 'function');
        this.assertNotUndefined(obj);

        if(obj.forEach){
            obj.forEach(func);
        }else if(this.isType(obj, 'array')){
            for(var i = 0; i < obj.length; i++){
                func(obj[i], i);
            }
        }else{
            for(var key in obj){
                func(obj[key], key);
            }
        }
    }
};

}).call(this,require("VCmEsw"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,arguments[3],arguments[4],arguments[5],arguments[6],"/util.js","/")
},{"VCmEsw":4,"buffer":1}]},{},[19])
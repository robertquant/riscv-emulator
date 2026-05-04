export class Memory {
  private data: Uint8Array;
  public size: number;

  constructor(size: number = 1024 * 1024) {
    this.size = size;
    this.data = new Uint8Array(size);
  }

  readByte(addr: number): number {
    return this.data[addr] ?? 0;
  }

  readHalf(addr: number): number {
    return this.readByte(addr) | (this.readByte(addr + 1) << 8);
  }

  readWord(addr: number): number {
    return (this.readByte(addr)
      | (this.readByte(addr + 1) << 8)
      | (this.readByte(addr + 2) << 16)
      | (this.readByte(addr + 3) << 24)) >>> 0;
  }

  writeByte(addr: number, val: number): void {
    if (addr < this.size) this.data[addr] = val & 0xFF;
  }

  writeHalf(addr: number, val: number): void {
    this.writeByte(addr, val & 0xFF);
    this.writeByte(addr + 1, (val >> 8) & 0xFF);
  }

  writeWord(addr: number, val: number): void {
    this.writeByte(addr, val & 0xFF);
    this.writeByte(addr + 1, (val >> 8) & 0xFF);
    this.writeByte(addr + 2, (val >> 16) & 0xFF);
    this.writeByte(addr + 3, (val >> 24) & 0xFF);
  }

  loadBytes(addr: number, bytes: Uint8Array | number[]): void {
    for (let i = 0; i < bytes.length; i++) {
      if (addr + i < this.size) this.data[addr + i] = bytes[i];
    }
  }

  readBytes(addr: number, length: number): Uint8Array {
    return this.data.slice(addr, addr + length);
  }

  dump(addr: number, length: number): string {
    let out = '';
    for (let i = 0; i < length; i += 16) {
      const hex = Array.from(this.data.slice(addr + i, addr + i + 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      const ascii = Array.from(this.data.slice(addr + i, addr + i + 16))
        .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')
        .join('');
      out += `${(addr + i).toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  |${ascii}|\n`;
    }
    return out;
  }

  reset(): void {
    this.data.fill(0);
  }
}

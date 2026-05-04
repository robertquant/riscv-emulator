# RISC-V Emulator

A RISC-V RV32I CPU emulator written from scratch in TypeScript, designed for learning CPU architecture and instruction sets.

## Features

### CPU Core
- **RV32I Base Integer Instruction Set** — 40+ instructions
- **RV32M Extension** — Multiply/Divide (mul, div, rem, mulh, etc.)
- **6 Instruction Formats** — R, I, S, B, U, J decoding
- **32 Registers + PC** — Full register file with ABI names
- **Fetch → Decode → Execute → Writeback** pipeline simulation

### Built-in Tools
- **Assembler** — Write RISC-V assembly, compile to machine code directly in the browser
- **Disassembler** — Machine code → human-readable assembly
- **18 Pseudo-instructions** — li, la, mv, not, neg, beqz, bnez, ret, call, j, etc.
- **Ecall Syscalls** — print int/string/char/hex/binary, exit, write

### Visual Debugger
- **Register Panel** — Real-time display of all 32 registers with change highlighting
- **Pipeline View** — Visualize Fetch/Decode/Execute/Writeback stages
- **Memory Inspector** — Hex dump of memory contents
- **Code Editor** — Write assembly and run it immediately
- **Single-Step Mode** — Execute one instruction at a time

### 15 Example Programs
| Example | Concepts |
|---------|----------|
| Hello World | Basic output, ecall, .data/.string |
| Fibonacci | Loops, addition, counters |
| Factorial | Recursion, stack frames, sw/lw |
| Sum 1-100 | Loop, conditional branch (ble) |
| Prime Check | Function calls, rem, return values |
| Bubble Sort | Array ops, .word, nested loops |
| GCD | Euclidean algorithm, rem |
| Power | Multiplication, stack frames |
| String Copy | Byte operations (lb/sb), .space |
| String Length | Character iteration, function + ret |
| FizzBuzz | M extension rem, multi-way branches |
| Binary Search | Recursion, stack management |
| Countdown | Simple loop with string output |
| Sum Array | .data section, array traversal |
| Find Maximum | Comparison tracking pattern |

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

## Project Structure

```
src/
├── cpu/
│   ├── cpu.ts           # CPU main loop (fetch-decode-execute)
│   ├── decoder.ts        # Instruction decoder (6 formats)
│   └── registers.ts      # 32 registers + PC
├── memory/
│   └── memory.ts         # Memory subsystem (byte/half/word)
├── assembler/
│   └── assembler.ts      # RISC-V assembler (asm → machine code)
├── disassembler/
│   └── disassembler.ts   # Disassembler (machine code → asm)
└── ui/
    └── app.ts            # Application controller + UI
```

## Supported Instructions

### RV32I (Base)
`lui` `auipc` `jal` `jalr` `beq` `bne` `blt` `bge` `bltu` `bgeu`
`lb` `lh` `lw` `lbu` `lhu` `sb` `sh` `sw`
`addi` `slti` `sltiu` `xori` `ori` `andi` `slli` `srli` `srai`
`add` `sub` `sll` `slt` `sltu` `xor` `srl` `sra` `or` `and`
`ecall` `ebreak` `fence`

### RV32M (Multiply/Divide)
`mul` `mulh` `mulhsu` `mulhu` `div` `divu` `rem` `remu`

### Pseudo-instructions
`li` `la` `mv` `not` `neg` `seqz` `snez` `sltz` `sgtz`
`beqz` `bnez` `blez` `bgez` `bltz` `bgtz`
`bgt` `ble` `bgtu` `bleu` `j` `jr` `ret` `call` `nop`

## What You'll Learn

- How a CPU fetches, decodes, and executes instructions
- Why RISC-V uses only 6 instruction formats
- The role of each of the 32 registers
- How memory addressing works (byte/half/word, little-endian)
- How functions use the stack (sw/lw, stack frames)
- How assembly maps 1:1 to machine code
- How conditions and branches work at the hardware level

## Tech Stack

- TypeScript (zero external CPU dependencies)
- Vite
- No framework — pure DOM manipulation

## License

MIT

package e131

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"
	"net"

	"github.com/footgunz/penumbra/config"
)

const (
	Port            = 5568
	UniverseSize    = 512
	PacketSize      = 126 + UniverseSize
)

var acnPacketIdentifier = []byte{
	0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31,
	0x37, 0x00, 0x00, 0x00,
}

// Dispatcher sends E1.31 packets to WLED devices.
type Dispatcher struct {
	sequences map[int]uint8   // per-universe sequence numbers
	conns     map[string]*net.UDPConn
	cid       [16]byte
}

func NewDispatcher(cfg *config.Config) *Dispatcher {
	cid := generateCID()
	return &Dispatcher{
		sequences: make(map[int]uint8),
		conns:     make(map[string]*net.UDPConn),
		cid:       cid,
	}
}

// Dispatch partitions state into universes and sends E1.31 packets.
func (d *Dispatcher) Dispatch(state map[string]float64, cfg *config.Config) {
	// Build per-universe DMX arrays
	universes := make(map[int][]byte)
	for paramName, value := range state {
		mapping, ok := cfg.Parameters[paramName]
		if !ok {
			continue
		}
		u := mapping.Universe
		if _, exists := universes[u]; !exists {
			universes[u] = make([]byte, UniverseSize)
		}
		ch := mapping.Channel - 1 // channel is 1-indexed
		if ch >= 0 && ch < UniverseSize {
			universes[u][ch] = floatToDMX(value)
		}
	}

	for universe, dmx := range universes {
		seq := d.nextSeq(universe)
		pkt := buildPacket(universe, dmx, seq, d.cid, "ableton-dmx")
		addr := universeMulticastAddr(universe)
		d.send(addr, pkt)
	}
}

func (d *Dispatcher) nextSeq(universe int) uint8 {
	d.sequences[universe] = (d.sequences[universe] + 1) & 0xff
	return d.sequences[universe]
}

func (d *Dispatcher) send(addr string, pkt []byte) {
	udpAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", addr, Port))
	if err != nil {
		return
	}
	conn, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.Write(pkt)
}

// UniverseMulticastAddr returns the E1.31 multicast address for a universe.
// Universe 1 → 239.255.0.1, Universe 2 → 239.255.0.2, etc.
func universeMulticastAddr(universe int) string {
	return fmt.Sprintf("239.255.%d.%d", (universe>>8)&0xff, universe&0xff)
}

func floatToDMX(v float64) byte {
	clamped := math.Max(0, math.Min(1, v))
	return byte(math.Round(clamped * 255))
}

func buildPacket(universe int, data []byte, seq uint8, cid [16]byte, sourceName string) []byte {
	buf := make([]byte, PacketSize)

	// Root layer
	binary.BigEndian.PutUint16(buf[0:], 0x0010)        // preamble size
	binary.BigEndian.PutUint16(buf[2:], 0x0000)        // postamble size
	copy(buf[4:], acnPacketIdentifier)                  // ACN PID
	rootPDULen := uint16(PacketSize - 16)
	binary.BigEndian.PutUint16(buf[16:], 0x7000|rootPDULen)
	binary.BigEndian.PutUint32(buf[18:], 0x00000004)   // vector: VECTOR_ROOT_E131_DATA
	copy(buf[22:], cid[:])                              // CID

	// Framing layer
	framingPDULen := uint16(PacketSize - 38)
	binary.BigEndian.PutUint16(buf[38:], 0x7000|framingPDULen)
	binary.BigEndian.PutUint32(buf[40:], 0x00000002)   // vector: VECTOR_E131_DATA_PACKET
	nameBytes := encodeSourceName(sourceName)
	copy(buf[44:], nameBytes)                           // source name (64 bytes)
	buf[108] = 100                                      // priority
	binary.BigEndian.PutUint16(buf[109:], 0)           // synchronization address
	buf[111] = seq                                      // sequence number
	buf[112] = 0                                        // options
	binary.BigEndian.PutUint16(buf[113:], uint16(universe))

	// DMP layer
	dmpPDULen := uint16(PacketSize - 114)
	binary.BigEndian.PutUint16(buf[114:], 0x7000|dmpPDULen)
	buf[116] = 0x02                                     // vector: VECTOR_DMP_SET_PROPERTY
	buf[117] = 0xa1                                     // address type and data type
	binary.BigEndian.PutUint16(buf[118:], 0x0000)      // first property address
	binary.BigEndian.PutUint16(buf[120:], 0x0001)      // address increment
	binary.BigEndian.PutUint16(buf[122:], UniverseSize+1) // property count
	buf[124] = 0x00                                     // DMX start code
	copy(buf[125:], data)

	return buf
}

func encodeSourceName(name string) []byte {
	buf := make([]byte, 64)
	for i, c := range name {
		if i >= 63 {
			break
		}
		buf[i] = byte(c)
	}
	return buf
}

func generateCID() [16]byte {
	var cid [16]byte
	if _, err := rand.Read(cid[:]); err != nil {
		// Fallback: deterministic bytes (should not happen)
		for i := range cid {
			cid[i] = byte(i + 1)
		}
	}
	return cid
}

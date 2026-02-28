package udp

import (
	"fmt"
	"log"
	"net"

	"github.com/vmihailenco/msgpack/v5"
)

// StatePacket is the wire format received from M4L (or the fake emitter).
type StatePacket struct {
	SessionID string             `msgpack:"session_id"`
	Ts        int64              `msgpack:"ts"`
	State     map[string]float64 `msgpack:"state"`
}

// Receiver reads UDP datagrams and decodes them as StatePackets.
type Receiver struct {
	port    int
	handler func(StatePacket)
}

// NewReceiver creates a Receiver that calls handler for each decoded packet.
func NewReceiver(port int, handler func(StatePacket)) *Receiver {
	return &Receiver{port: port, handler: handler}
}

// Listen opens a UDP socket and blocks, decoding packets and calling the handler.
// Logs and continues on decode errors; fatals on socket errors.
func (r *Receiver) Listen() {
	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("0.0.0.0:%d", r.port))
	if err != nil {
		log.Fatalf("udp: resolve addr: %v", err)
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Fatalf("udp: listen: %v", err)
	}
	defer conn.Close()
	log.Printf("udp: listening on :%d", r.port)

	buf := make([]byte, 65536)
	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("udp: read error: %v", err)
			continue
		}
		var pkt StatePacket
		if err := msgpack.Unmarshal(buf[:n], &pkt); err != nil {
			log.Printf("udp: decode error: %v", err)
			continue
		}
		r.handler(pkt)
	}
}

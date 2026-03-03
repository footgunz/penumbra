package tui

import (
	"bytes"
	"sync"

	tea "github.com/charmbracelet/bubbletea"
)

// LogWriter implements io.Writer and forwards each complete line to a
// tea.Program as a LogMsg. Write never blocks — lines are buffered in a
// channel and drained by a background goroutine. Safe for concurrent use.
type LogWriter struct {
	ch chan string
	mu sync.Mutex
	buf []byte
}

// NewLogWriter creates a LogWriter that sends log lines to p.
// Starts a background goroutine that drains the internal channel.
func NewLogWriter(p *tea.Program) *LogWriter {
	w := &LogWriter{ch: make(chan string, 256)}
	go func() {
		for line := range w.ch {
			p.Send(LogMsg(line))
		}
	}()
	return w
}

func (w *LogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.buf = append(w.buf, p...)
	for {
		idx := bytes.IndexByte(w.buf, '\n')
		if idx < 0 {
			break
		}
		line := string(w.buf[:idx])
		w.buf = w.buf[idx+1:]
		if line != "" {
			select {
			case w.ch <- line:
			default:
			}
		}
	}
	return len(p), nil
}

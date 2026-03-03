package tui

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// --- Messages sent from server goroutines via Program.Send() ---

// ParamUpdateMsg carries the full parameter state map.
type ParamUpdateMsg map[string]float64

// SessionMsg carries the current session ID.
type SessionMsg string

// M4LSeenMsg signals that a UDP packet was received from M4L/emitter.
type M4LSeenMsg struct{}

// UniverseMsg carries the status of a single universe.
type UniverseMsg struct {
	ID     int
	Label  string
	IP     string
	Online bool
}

// ChannelTarget identifies a DMX channel within a universe.
type ChannelTarget struct {
	Universe int
	Channel  int
}

// ConfigMsg carries the parameter-to-DMX-channel mapping from server config.
type ConfigMsg map[string][]ChannelTarget

// LogMsg carries a single log line.
type LogMsg string

type tickMsg time.Time

func tickEvery(d time.Duration) tea.Cmd {
	return tea.Tick(d, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

type focus int

const (
	focusFilter focus = iota
	focusLog
)

type universeInfo struct {
	label  string
	ip     string
	online bool
}

// Model is the bubbletea model for the Penumbra TUI.
type Model struct {
	params      map[string]float64
	configMap   map[string][]ChannelTarget
	filter      textinput.Model
	sessionID   string
	m4lLastSeen time.Time
	startTime   time.Time
	universes   map[int]universeInfo
	logLines    []string
	logViewport viewport.Model
	focus       focus
	width       int
	height      int
	ready       bool
	quitting    bool
}

// New creates a Model ready for tea.NewProgram.
func New() Model {
	ti := textinput.New()
	ti.Placeholder = "type to filter..."
	ti.Prompt = "/ "
	ti.CharLimit = 64
	ti.Focus()

	return Model{
		params:    make(map[string]float64),
		filter:    ti,
		startTime: time.Now(),
		universes: make(map[int]universeInfo),
		logLines:  make([]string, 0, 128),
		focus:     focusFilter,
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(tickEvery(time.Second), textinput.Blink)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "q":
			if m.focus == focusLog {
				m.quitting = true
				return m, tea.Quit
			}
		case "tab":
			if m.focus == focusFilter {
				m.focus = focusLog
				m.filter.Blur()
			} else {
				m.focus = focusFilter
				m.filter.Focus()
			}
			return m, nil
		case "esc":
			if m.focus == focusFilter {
				m.filter.SetValue("")
			} else {
				m.focus = focusFilter
				m.filter.Focus()
			}
			return m, nil
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		logH := m.logViewportHeight()
		if !m.ready {
			m.logViewport = viewport.New(msg.Width-2, logH)
			m.logViewport.SetContent(strings.Join(m.logLines, "\n"))
			m.ready = true
		} else {
			m.logViewport.Width = msg.Width - 2
			m.logViewport.Height = logH
		}
		return m, nil

	case ConfigMsg:
		m.configMap = map[string][]ChannelTarget(msg)
		return m, nil

	case ParamUpdateMsg:
		for k, v := range msg {
			m.params[k] = v
		}
		return m, nil

	case SessionMsg:
		newID := string(msg)
		if m.sessionID != "" && newID != m.sessionID {
			m.params = make(map[string]float64)
		}
		m.sessionID = newID
		return m, nil

	case M4LSeenMsg:
		m.m4lLastSeen = time.Now()
		return m, nil

	case UniverseMsg:
		m.universes[msg.ID] = universeInfo{
			label:  msg.Label,
			ip:     msg.IP,
			online: msg.Online,
		}
		return m, nil

	case LogMsg:
		m.logLines = append(m.logLines, string(msg))
		if len(m.logLines) > 1000 {
			m.logLines = m.logLines[len(m.logLines)-500:]
		}
		if m.ready {
			m.logViewport.SetContent(strings.Join(m.logLines, "\n"))
			m.logViewport.GotoBottom()
		}
		return m, nil

	case tickMsg:
		return m, tickEvery(time.Second)
	}

	var cmd tea.Cmd
	if m.focus == focusFilter {
		m.filter, cmd = m.filter.Update(msg)
	} else {
		m.logViewport, cmd = m.logViewport.Update(msg)
	}
	return m, cmd
}

// --- Styles ---

var (
	titleStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	headerStyle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("99"))
	okStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	errStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	dimStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	barFullStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	barDimStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("238"))
)

func (m Model) logViewportHeight() int {
	h := m.height / 4
	if h < 5 {
		h = 5
	}
	return h
}

// universeChannelLines computes how many lines the universe detail section needs.
func (m Model) universeChannelLines() int {
	uIDs := m.sortedUniverseIDs()
	lines := 0
	for _, id := range uIDs {
		lines++ // universe header line
		lines += len(m.channelsForUniverse(id))
	}
	return lines
}

func (m Model) sortedUniverseIDs() []int {
	ids := make([]int, 0, len(m.universes))
	for id := range m.universes {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	return ids
}

type channelEntry struct {
	channel int
	param   string
	dmx     int
	value   float64
}

func (m Model) channelsForUniverse(uid int) []channelEntry {
	var entries []channelEntry
	for param, targets := range m.configMap {
		for _, t := range targets {
			if t.Universe != uid {
				continue
			}
			v := math.Max(0, math.Min(1, m.params[param]))
			entries = append(entries, channelEntry{
				channel: t.Channel,
				param:   param,
				dmx:     int(math.Round(v * 255)),
				value:   v,
			})
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].channel < entries[j].channel })
	return entries
}

func (m Model) View() string {
	if m.quitting {
		return ""
	}
	if !m.ready {
		return " Initializing..."
	}

	var b strings.Builder

	// ── Header ──
	b.WriteString(titleStyle.Render(" PENUMBRA"))
	b.WriteByte('\n')

	m4l := errStyle.Render("● disconnected")
	if !m.m4lLastSeen.IsZero() && time.Since(m.m4lLastSeen) < 5*time.Second {
		m4l = okStyle.Render("● connected")
	}
	sess := m.sessionID
	if sess == "" {
		sess = "—"
	} else if len(sess) > 8 {
		sess = sess[:8]
	}
	up := time.Since(m.startTime).Truncate(time.Second)
	b.WriteString(fmt.Sprintf(" M4L %s  Session %s  Uptime %s\n",
		m4l, headerStyle.Render(sess), dimStyle.Render(up.String())))

	// ── Universes ──
	uIDs := m.sortedUniverseIDs()
	total := len(uIDs)
	online := 0
	for _, id := range uIDs {
		if m.universes[id].online {
			online++
		}
	}

	b.WriteByte('\n')
	uCountStyle := okStyle
	if online < total {
		uCountStyle = errStyle
	}
	if total == 0 {
		uCountStyle = dimStyle
	}
	b.WriteString(headerStyle.Render(" Universes") + "  " +
		uCountStyle.Render(fmt.Sprintf("%d/%d online", online, total)))
	b.WriteByte('\n')

	nameW := 28
	chBarW := 10
	if m.width > 100 {
		nameW = 36
		chBarW = 16
	}

	for _, id := range uIDs {
		u := m.universes[id]
		dot := errStyle.Render("●")
		if u.online {
			dot = okStyle.Render("●")
		}
		label := u.label
		if label == "" {
			label = fmt.Sprintf("Universe %d", id)
		}
		b.WriteString(fmt.Sprintf(" %s %s", dot, label))
		if u.ip != "" {
			b.WriteString(dimStyle.Render(fmt.Sprintf("  %s", u.ip)))
		}
		b.WriteByte('\n')

		channels := m.channelsForUniverse(id)
		for _, ch := range channels {
			pName := ch.param
			if len(pName) > nameW {
				pName = pName[:nameW-1] + "…"
			}
			filled := int(float64(chBarW) * ch.value)
			bar := barFullStyle.Render(strings.Repeat("█", filled)) +
				barDimStyle.Render(strings.Repeat("░", chBarW-filled))
			b.WriteString(fmt.Sprintf("     %3d  %-*s %s %s\n",
				ch.channel, nameW, pName, bar, dimStyle.Render(fmt.Sprintf("%3d", ch.dmx))))
		}
		if len(channels) == 0 {
			b.WriteString(dimStyle.Render("     no channels mapped"))
			b.WriteByte('\n')
		}
	}
	if total == 0 {
		b.WriteString(dimStyle.Render(" No universes configured"))
		b.WriteByte('\n')
	}

	// ── Parameters ──
	b.WriteByte('\n')
	b.WriteString(headerStyle.Render(" Parameters") + "  " + m.filter.View())
	b.WriteByte('\n')

	filter := strings.ToLower(m.filter.Value())
	type entry struct {
		name  string
		value float64
	}
	var filtered []entry
	for k, v := range m.params {
		if filter == "" || strings.Contains(strings.ToLower(k), filter) {
			filtered = append(filtered, entry{k, v})
		}
	}
	sort.Slice(filtered, func(i, j int) bool { return filtered[i].name < filtered[j].name })

	logH := m.logViewportHeight()
	uLines := m.universeChannelLines()
	// fixed: title(1) + status(1) + blank(1) + universe header(1) + blank(1)
	//        + param header(1) + blank(1) + log header(1) + help(1) = 9
	fixedLines := 9
	paramLines := m.height - fixedLines - logH - uLines
	if paramLines < 3 {
		paramLines = 3
	}

	pNameW, pBarW := 30, 20
	if m.width > 100 {
		pNameW, pBarW = 40, 30
	}

	for i, p := range filtered {
		if i >= paramLines {
			b.WriteString(dimStyle.Render(fmt.Sprintf(" ... and %d more", len(filtered)-paramLines)))
			b.WriteByte('\n')
			break
		}
		name := p.name
		if len(name) > pNameW {
			name = name[:pNameW-1] + "…"
		}
		v := math.Max(0, math.Min(1, p.value))
		dmx := int(math.Round(v * 255))
		filled := int(float64(pBarW) * v)
		bar := barFullStyle.Render(strings.Repeat("█", filled)) +
			barDimStyle.Render(strings.Repeat("░", pBarW-filled))
		b.WriteString(fmt.Sprintf(" %-*s %s %5.2f %s\n",
			pNameW, name, bar, p.value, dimStyle.Render(fmt.Sprintf("(%3d)", dmx))))
	}
	if len(filtered) == 0 {
		if len(m.params) == 0 {
			b.WriteString(dimStyle.Render(" Waiting for data..."))
		} else {
			b.WriteString(dimStyle.Render(" No parameters match filter"))
		}
		b.WriteByte('\n')
	}

	// ── Log ──
	b.WriteByte('\n')
	hint := ""
	if m.focus == focusLog {
		hint = dimStyle.Render("  ↑↓ scroll  q quit")
	}
	b.WriteString(headerStyle.Render(" Log") + hint)
	b.WriteByte('\n')
	b.WriteString(m.logViewport.View())

	// ── Help ──
	b.WriteByte('\n')
	b.WriteString(dimStyle.Render(" tab focus  / filter  esc clear  ctrl+c quit"))

	return b.String()
}

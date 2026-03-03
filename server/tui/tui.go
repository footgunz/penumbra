package tui

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/footgunz/penumbra/config"
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

// M4LTimeoutsMsg carries the idle and disconnect timeout durations.
type M4LTimeoutsMsg struct {
	IdleTimeout       time.Duration
	DisconnectTimeout time.Duration
}

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
	focusParams focus = iota
	focusUniverses
	focusLog
)

type universeInfo struct {
	label  string
	ip     string
	online bool
}

// marquee returns s truncated to maxWidth. If s is longer, it scrolls
// through s using tick as the position counter, wrapping with a gap.
func marquee(s string, maxWidth, tick int) string {
	if len(s) <= maxWidth {
		return s
	}
	gap := "   "
	loop := s + gap + s
	period := len(s) + len(gap)
	off := tick % period
	return loop[off : off+maxWidth]
}

// BlackoutFuncs groups the blackout-related functions the TUI needs.
type BlackoutFuncs struct {
	IsActive func() bool // polls current state — atomic, no blocking
	Trigger  func()      // activates blackout
	Reset    func()      // clears blackout
}

// Model is the bubbletea model for the Penumbra TUI.
type Model struct {
	params    map[string]float64
	configMap map[string][]ChannelTarget
	filter    textinput.Model
	sessionID string
	tick      int
	m4lLastSeen       time.Time
	idleTimeout       time.Duration
	disconnectTimeout time.Duration
	bo                BlackoutFuncs
	startTime    time.Time
	universes    map[int]universeInfo
	logLines     []string
	logViewport  viewport.Model
	focus        focus
	width        int
	height       int
	ready        bool
	quitting     bool
}

// New creates a Model ready for tea.NewProgram.
func New(bo BlackoutFuncs) Model {
	ti := textinput.New()
	ti.Placeholder = "type to filter..."
	ti.Prompt = "/ "
	ti.CharLimit = 64
	ti.Focus()

	return Model{
		params:            make(map[string]float64),
		filter:            ti,
		startTime:         time.Now(),
		idleTimeout:       5 * time.Second,
		disconnectTimeout: 3600 * time.Second,
		bo:                bo,
		universes:         make(map[int]universeInfo),
		logLines:          make([]string, 0, 128),
		focus:             focusParams,
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(tickEvery(time.Second), textinput.Blink)
}

func (m *Model) setFocus(f focus) {
	m.focus = f
	if f == focusParams || f == focusUniverses {
		m.filter.Focus()
	} else {
		m.filter.Blur()
	}
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
			switch m.focus {
			case focusParams:
				m.setFocus(focusUniverses)
			case focusUniverses:
				m.setFocus(focusLog)
			case focusLog:
				m.setFocus(focusParams)
			}
			return m, nil
		case "shift+tab":
			switch m.focus {
			case focusParams:
				m.setFocus(focusLog)
			case focusUniverses:
				m.setFocus(focusParams)
			case focusLog:
				m.setFocus(focusUniverses)
			}
			return m, nil
		case "!":
			if m.bo.Trigger != nil {
				m.bo.Trigger()
			}
			return m, nil
		case "esc":
			if m.bo.IsActive != nil && m.bo.IsActive() {
				if m.bo.Reset != nil {
					m.bo.Reset()
				}
				return m, nil
			}
			if m.focus == focusParams {
				m.filter.SetValue("")
			} else {
				m.setFocus(focusParams)
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
			m.tick = 0
		}
		m.sessionID = newID
		return m, nil

	case M4LSeenMsg:
		m.m4lLastSeen = time.Now()
		return m, nil

	case M4LTimeoutsMsg:
		m.idleTimeout = msg.IdleTimeout
		m.disconnectTimeout = msg.DisconnectTimeout
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
		m.tick++
		return m, tickEvery(time.Second)
	}

	var cmd tea.Cmd
	switch m.focus {
	case focusParams, focusUniverses:
		m.filter, cmd = m.filter.Update(msg)
	case focusLog:
		m.logViewport, cmd = m.logViewport.Update(msg)
	}
	return m, cmd
}

// --- Styles ---

var (
	titleStyle       = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	headerStyle      = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("99"))
	activeTabStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	inactiveTabStyle = dimStyle
	okStyle          = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	warnStyle        = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	errStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	dimStyle         = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
	barFullStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	barDimStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("238"))
	blackoutStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("15")).Background(lipgloss.Color("196"))
)

func (m Model) m4lState() config.M4LState {
	if m.m4lLastSeen.IsZero() {
		return config.M4LDisconnected
	}
	elapsed := time.Since(m.m4lLastSeen)
	if elapsed >= m.disconnectTimeout {
		return config.M4LDisconnected
	}
	if elapsed >= m.idleTimeout {
		return config.M4LIdle
	}
	return config.M4LConnected
}

func (m Model) logViewportHeight() int {
	h := m.height / 4
	if h < 5 {
		h = 5
	}
	return h
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

func (m Model) channelsForUniverse(uid int, filter string) []channelEntry {
	var entries []channelEntry
	for param, targets := range m.configMap {
		for _, t := range targets {
			if t.Universe != uid {
				continue
			}
			if filter != "" &&
				!strings.Contains(strings.ToLower(param), filter) &&
				!strings.Contains(strconv.Itoa(t.Channel), filter) {
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

	var m4l string
	switch m.m4lState() {
	case config.M4LConnected:
		m4l = okStyle.Render("● connected")
	case config.M4LIdle:
		m4l = warnStyle.Render("● idle")
	default:
		m4l = errStyle.Render("● disconnected")
	}
	up := time.Since(m.startTime).Truncate(time.Second)

	uIDs := m.sortedUniverseIDs()
	total := len(uIDs)
	online := 0
	for _, id := range uIDs {
		if m.universes[id].online {
			online++
		}
	}
	uCountStyle := okStyle
	if online < total {
		uCountStyle = errStyle
	}
	if total == 0 {
		uCountStyle = dimStyle
	}

	sess := m.sessionID
	if sess == "" {
		sess = "—"
	} else {
		sess = marquee(sess, 12, m.tick)
	}

	b.WriteString(fmt.Sprintf(" M4L %s  Universes %s  Uptime %s  Session %s\n",
		m4l,
		uCountStyle.Render(fmt.Sprintf("%d/%d", online, total)),
		dimStyle.Render(up.String()),
		headerStyle.Render(sess)))

	blackout := m.bo.IsActive != nil && m.bo.IsActive()
	if blackout {
		banner := " ██ BLACKOUT ACTIVE ██  press esc to reset "
		pad := m.width - len(banner)
		if pad > 0 {
			banner += strings.Repeat(" ", pad)
		}
		b.WriteString(blackoutStyle.Render(banner))
		b.WriteByte('\n')
	}

	// ── Tab bar ──
	b.WriteByte('\n')
	paramTab := inactiveTabStyle.Render(" Parameters ")
	univTab := inactiveTabStyle.Render(" Universes ")
	switch m.focus {
	case focusParams:
		paramTab = activeTabStyle.Render("▸Parameters ")
	case focusUniverses:
		univTab = activeTabStyle.Render("▸Universes ")
	}
	b.WriteString(" " + paramTab + "  " + univTab)
	if m.focus == focusParams || m.focus == focusUniverses {
		b.WriteString("  " + m.filter.View())
	}
	b.WriteByte('\n')

	// ── Main panel ──
	logH := m.logViewportHeight()
	// fixed: title(1) + status(1) + blank(1) + tabs(1) + blank(1) + log header(1) + help(1) = 7
	fixed := 7
	if blackout {
		fixed++
	}
	mainLines := m.height - fixed - logH
	if mainLines < 3 {
		mainLines = 3
	}

	switch m.focus {
	case focusParams:
		m.viewParams(&b, mainLines)
	case focusUniverses:
		m.viewUniverses(&b, mainLines)
	case focusLog:
		m.viewParams(&b, mainLines)
	}

	// ── Log ──
	b.WriteByte('\n')
	logLabel := headerStyle.Render(" Log")
	if m.focus == focusLog {
		logLabel = activeTabStyle.Render("▸Log")
		logLabel += dimStyle.Render("  ↑↓ scroll  q quit")
	}
	b.WriteString(logLabel)
	b.WriteByte('\n')
	b.WriteString(m.logViewport.View())

	// ── Help ──
	b.WriteByte('\n')
	if blackout {
		b.WriteString(dimStyle.Render(" esc reset blackout  ctrl+c quit"))
	} else {
		b.WriteString(dimStyle.Render(" tab/shift+tab navigate  / filter  ! blackout  esc back  ctrl+c quit"))
	}

	return b.String()
}

func (m Model) viewParams(b *strings.Builder, maxLines int) {
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

	nameW, barW := 30, 20
	if m.width > 100 {
		nameW, barW = 40, 30
	}

	for i, p := range filtered {
		if i >= maxLines {
			b.WriteString(dimStyle.Render(fmt.Sprintf(" ... and %d more", len(filtered)-maxLines)))
			b.WriteByte('\n')
			break
		}
		name := p.name
		if len(name) > nameW {
			name = name[:nameW-1] + "…"
		}
		v := math.Max(0, math.Min(1, p.value))
		dmx := int(math.Round(v * 255))
		filled := int(float64(barW) * v)
		bar := barFullStyle.Render(strings.Repeat("█", filled)) +
			barDimStyle.Render(strings.Repeat("░", barW-filled))
		b.WriteString(fmt.Sprintf(" %-*s %s %5.2f %s\n",
			nameW, name, bar, p.value, dimStyle.Render(fmt.Sprintf("(%3d)", dmx))))
	}
	if len(filtered) == 0 {
		if len(m.params) == 0 {
			b.WriteString(dimStyle.Render(" Waiting for data..."))
		} else {
			b.WriteString(dimStyle.Render(" No parameters match filter"))
		}
		b.WriteByte('\n')
	}
}

func (m Model) viewUniverses(b *strings.Builder, maxLines int) {
	uIDs := m.sortedUniverseIDs()
	filter := strings.ToLower(m.filter.Value())

	nameW := 28
	chBarW := 10
	if m.width > 100 {
		nameW = 36
		chBarW = 16
	}

	lines := 0
	shown := 0
	for _, id := range uIDs {
		channels := m.channelsForUniverse(id, filter)
		if filter != "" && len(channels) == 0 {
			continue
		}

		if lines >= maxLines {
			b.WriteString(dimStyle.Render(" ..."))
			b.WriteByte('\n')
			break
		}

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
		lines++
		shown++

		for _, ch := range channels {
			if lines >= maxLines {
				b.WriteString(dimStyle.Render("     ..."))
				b.WriteByte('\n')
				lines++
				break
			}
			pName := ch.param
			if len(pName) > nameW {
				pName = pName[:nameW-1] + "…"
			}
			filled := int(float64(chBarW) * ch.value)
			bar := barFullStyle.Render(strings.Repeat("█", filled)) +
				barDimStyle.Render(strings.Repeat("░", chBarW-filled))
			b.WriteString(fmt.Sprintf("     %3d  %-*s %s %s\n",
				ch.channel, nameW, pName, bar, dimStyle.Render(fmt.Sprintf("%3d", ch.dmx))))
			lines++
		}
		if len(channels) == 0 {
			b.WriteString(dimStyle.Render("     no channels mapped"))
			b.WriteByte('\n')
			lines++
		}
	}
	if shown == 0 {
		if len(uIDs) == 0 {
			b.WriteString(dimStyle.Render(" No universes configured"))
		} else {
			b.WriteString(dimStyle.Render(" No universes match filter"))
		}
		b.WriteByte('\n')
	}
}

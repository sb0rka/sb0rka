package plan

const (
	CodeCommunityAccount = "community_account"
	CodeCommunityProject = "community_project"
)

type Defaults struct {
	AccountCode string
	ProjectCode string
}

func (d Defaults) WithDefaults() Defaults {
	if d.AccountCode == "" {
		d.AccountCode = CodeCommunityAccount
	}
	if d.ProjectCode == "" {
		d.ProjectCode = CodeCommunityProject
	}
	return d
}

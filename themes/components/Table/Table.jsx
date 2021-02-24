import { SearchOutlined } from '@ant-design/icons';
import { Table, Button } from 'antd';
import { addQuery } from 'themes/route'
import { withRouter, useRouter } from 'next/router'
import Highlighter from "react-highlight-words";
import { Base64 } from 'js-base64';
import _ from 'lodash'
import FilterInput from './SearchComponents/Input'
import DatePicker from './SearchComponents/DatePicker'
import Radio from './SearchComponents/RadioButton'

class GridTable extends React.Component {
    constructor(props) {
        super(props);
        this.initialProps = {
            bordered: true,
            size: 'middle',
            showHeader: true,
            hasData: true,
        }

        this.state = {
            loading: false,
            reload: false
        }
        this.pagination = {}
        this.total = this.props.total || 100
        this.data = this.props.data
        this.handleTableChange = this.handleTableChange.bind(this)
    }

    /**
     * Khởi tạo các options từ query trên url
     */
    init() {
        const query = this.props.router.query
        const defaultOptions = GridTable.getDataFromQuery(query, this.props)
        this.pagination = {
            pageSize: defaultOptions.pageSize || 50,
            page: defaultOptions.page || 0,
        }
        this.columns = this.props.columns;

        this.defaultOptionToColumns(defaultOptions);
    }

    /**
     * Convert lại dữ liệu từ query đổi sang đúng format của column trong antd
     */
    defaultOptionToColumns = (defaultOptions) => {
        this.columns = this.columns.map(column => {
            //set field
            if(!column.field) column.field = column.key
            
            let sort = defaultOptions.sorting.find(item => item.field === column.field);
            if (sort) {
                let { direction } = sort;
                column.sortOrder = direction === "asc" ? 'ascend' : 'descend';
            }
            let filters = defaultOptions.filters.filter(item => item.field === column.field);
            if (filters.length) {
                column.filteredValue = [...filters];
            }
            else {
                delete column.filteredValue
            }
            if (column.filterable) {
                //    delete column.filterable;
                column = { ...column, ...this.getColumnSearchProps(column,'input') }
            }
            if (column.filterDate) {
                //    delete column.filterable;
                column = { ...column, ...this.getColumnSearchProps(column,'date') }
            }
            if (column.filterCheck) {
                column = { ...column, ...this.getColumnSearchProps(column,'check') }
            }
            return column;
        })
    }
    componentDidMount() {
        this.init();
        this.setState({reload: !this.state.reload})
    }
    componentDidUpdate(prevProps) {
        //update data trong trường hợp đổi từ props bên ngoài
        if (JSON.stringify(prevProps.data) !== JSON.stringify(this.props.data)) {
            this.data = this.props.data;
        }
        if (JSON.stringify(this.props.router.query) != JSON.stringify(prevProps.router.query)) {
            this.init();
            this.setState({reload: !this.state.reload}) //chỉ cần render lại view
        }
    }

    static makeQuery(options) {
        const { filters = [], sorting = [], pageSize, page } = options
        let queryObj = {
            f: [],
            s: {},
            ps: pageSize,
            p: page
        }

        for (let filter of filters) {
            queryObj.f.push([filter.field, filter.operator || 'contains', filter.value])
        }
        for (let sort of sorting) {
            queryObj.s[sort.field] = sort.direction
        }
        return Base64.encode(JSON.stringify(queryObj))
    }

    /**
     * Khai báo các function cho dropdown search box
     */
    getColumnSearchProps = (column,type) => {
        let ref = React.createRef()
        return {
            filterDropdown: ({ confirm, setSelectedKeys }) => {
                let confirmFnc = (values) => {
                    let currentColumn = this.columns.find(c => c.dataIndex === column.dataIndex)
                    setSelectedKeys(values)
                    confirm()
                    this.reload();
                }
                if (column.renderFilter) {
                    return column.renderFilter({ column, confirm: confirmFnc, ref })
                }
                if(type == 'input')
                    return <FilterInput
                        column={column}
                        ref={ref}
                        confirm={confirmFnc}
                    />
                if(type == 'date')
                    return <DatePicker
                        column={column}
                        ref={ref}
                        confirm={confirmFnc}
                    />
                if(type == 'check')
                    return <Radio
                        column={column}
                        ref={ref}
                        confirm={confirmFnc}
                    />
                
            },
            filterIcon: filtered => (
                <SearchOutlined style={{ color: filtered ? "#1890ff" : undefined }} />
            ),
            onFilterDropdownVisibleChange: visible => {
                if (!visible && column.visibleSearch != visible) {
                    column.visibleSearch = visible
                    if (ref.current) {
                        ref.current.onSubmit();
                    }
                }
                column.visibleSearch = visible
                
            }
        };
    }

    clearAll = async () => {
        let { pageSize, page } = this.pagination
        await this.handleTableChange({ pageSize, current: page }, {}, {})
    }

    /**
     * Reload Table
     */
    async reload() {
        this.setState({ loading: true })
        if (typeof this.props.fetchData === 'function') {
            const params = this.buildFetchData()
            
            const queryOptions = GridTable.makeQuery(params)
            // console.log(params, queryOptions)
            addQuery({ filters: queryOptions })
            
            let result = await this.props.fetchData(params) || {}
            if (result.total != undefined) this.total = result.total
            this.data = _.get(result, 'data', []);
        }
        this.setState({ loading: false })
    }

    /**
     * Set filter từ table vào biến this.columns để controlled
     */
    setFiltersToColumns = (filters = {}) => {
        this.columns = this.columns.map(column => {
            let filter = filters[column.field];
            if (filter) {
                column.filteredValue = filter;
            } else {
                delete column.filteredValue;
            }
            return column;
        })
    }

    setSorterToColumns = (sorter = {}) => {
        this.columns = this.columns.map(column => {
            if (column.key == sorter.columnKey) {
                column.sortOrder = sorter.order;
            } else {
                delete column.sortOrder;
            }
            return column;
        })
    }
    setPagination = (pagination) => {
        this.pagination = {
            pageSize: pagination.pageSize,
            page: pagination.current - 1
        }
    }


    handleTableChange = async (pagination, filters, sorter) => {
        this.setFiltersToColumns(filters);
        this.setSorterToColumns(sorter);
        this.setPagination(pagination);
        this.reload();
    }

    static getDataFromQuery(query = {}, defaultOptions = {}) {
        let queryObj = query.filters || {}
        if (typeof query.filters == 'string') {
            try {
                queryObj = JSON.parse(Base64.decode(query.filters))
            }
            catch (e) {
                throw new Error(`filters params invalid format.`)
            }
        }
        if (!queryObj) return {}
        let filters = queryObj.f || []
        let sorting = queryObj.s || {}
        let queryOut = {
            filters: defaultOptions.filters || [],
            sorting: defaultOptions.sorting || [],
            pageSize: queryObj.ps || defaultOptions.pageSize,
            page: queryObj.p || defaultOptions.page
        } 

        for (let filter of filters) {
            queryOut.filters.push({
                field: filter[0],
                operator: filter[1],
                value: filter[2]
            })
        }
        for (let field in sorting) {
            queryOut.sorting.push({
                field: field,
                direction: sorting[field]
            })
        }

        return queryOut;
    }

    static getOptions(query, defaultOptions) {
        if (query && Object.keys(query).length > 0) return this.getDataFromQuery(query, defaultOptions)
        return defaultOptions
    }

    /**
     * Build data từ this.columns để khớp với format trên server
     */
    buildFetchData = () => {
        let params = {
            filters: [],
            sorting: [],
            pageSize: this.pagination.pageSize,
            page: this.pagination.page
        }

        this.columns.map(column => {
            if (column.filteredValue) {
                params.filters = [
                    ...params.filters,
                    ...column.filteredValue
                ]
            }
            if (column.sortOrder) {
                params.sorting.push({
                    field: column.field,
                    direction: column.sortOrder == "ascend" ? "asc" : "desc",
                })
            }
        })
        return params

    }

    getPagination = (pagination = {}) => {
        const { pageSize, page } = this.pagination;
        return {
            ...pagination,
            total: this.total,
            position: 'bottom',
            pageSize: pageSize || 50,
            current: page + 1,
            showSizeChanger: true,
            pageSizeOptions: ['2', '10', '50', '100', '200', '500']
        }
    }

    render() {
        const { hasData = true, data = [], ellipsis, fetchData, columns, pagination, ...otherProps } = this.props;
        return (
            <div>
                <Table
                    {...this.initialProps}
                    // tableLayout="fixed"
                    scroll={{
                        x: 900,
                        scrollToFirstRowOnChange: true
                    }}
                    {...otherProps}
                    columns={this.columns}
                    dataSource={hasData ? this.data.map(row => ({ ...row, key: row.id })) : null}
                    onChange={this.handleTableChange}
                    loading={this.state.loading}
                    pagination={this.getPagination(pagination)}
                />
            </div>
        );
    }
}

export default GridTable